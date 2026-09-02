import { anthropic } from "@/lib/anthropic/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { buildClientDataDigest, DEMO_DATA_DIGEST } from "@/lib/assistant/data-context";

export const maxDuration = 60;

const SYSTEM_PROMPT = `You are Heliast's AI assistant, built on Claude, embedded in a client's
marketing performance dashboard (SEO, ads, social, traffic). The business
owner can ask you anything about their own performance data, including
specific time windows (e.g. "growth in the last 3 days") — the data below
already covers the last 90 days at daily granularity, so compute exact
answers from it directly rather than only reporting pre-aggregated totals.

Rules:
- Base every answer ONLY on the data provided below. Never invent numbers,
  campaigns, or keywords that aren't in it.
- If the data needed to answer isn't present (e.g. a time range or metric
  with no rows), say so plainly instead of guessing.
- Keep answers conversational and concise for quick questions; write
  longer, well-formatted markdown (headers, tables, bullets) when asked
  for something report-like ("write me a report on...", "summarize...").
- You are Claude (Anthropic) — if asked what model or AI you are, say so
  plainly.`;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function POST(req: Request) {
  if (!anthropic) {
    return new Response("ANTHROPIC_API_KEY is not configured", { status: 500 });
  }

  const body = (await req.json()) as { messages?: ChatMessage[]; demo?: boolean };
  const messages = body.messages;
  if (!messages || messages.length === 0 || messages[messages.length - 1].role !== "user") {
    return new Response("messages must be a non-empty array ending in a user message", { status: 400 });
  }

  let digest: string;

  if (body.demo) {
    digest = DEMO_DATA_DIGEST;
  } else {
    if (!supabaseAdmin) {
      return new Response("SUPABASE_SERVICE_ROLE_KEY is not configured", { status: 500 });
    }
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return new Response("Missing bearer token", { status: 401 });
    }
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !userData.user) {
      return new Response("Invalid session", { status: 401 });
    }
    const { data: client, error: clientError } = await supabaseAdmin
      .from("dashboard_clients")
      .select("id")
      .eq("owner_user_id", userData.user.id)
      .limit(1)
      .maybeSingle();
    if (clientError || !client) {
      return new Response("No client profile linked to this account", { status: 404 });
    }
    digest = await buildClientDataDigest(supabaseAdmin, client.id);
  }

  const claudeStream = anthropic.messages.stream({
    model: "claude-opus-5",
    max_tokens: 8000,
    system: `${SYSTEM_PROMPT}\n\n---\n\nCurrent data:\n\n${digest}`,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      claudeStream.on("text", (text) => {
        controller.enqueue(encoder.encode(text));
      });
      claudeStream.on("error", (err) => {
        controller.error(err);
      });
      try {
        await claudeStream.finalMessage();
      } catch (err) {
        controller.error(err);
        return;
      }
      controller.close();
    },
  });

  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
