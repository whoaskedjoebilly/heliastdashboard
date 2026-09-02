import { anthropic } from "@/lib/anthropic/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { buildClientDataDigest, DEMO_DATA_DIGEST } from "@/lib/reports/build-context";

export const maxDuration = 60;

const SYSTEM_PROMPT = `You are the reporting assistant inside the Heliast client dashboard. A
business owner is asking you for a custom performance report. You will be
given that business's real analytics data (traffic, SEO keywords, ad
campaigns, social stats) as a text digest.

Rules:
- Base the report ONLY on the data provided below. Never invent numbers,
  campaigns, or keywords that aren't in the digest.
- If the data needed to answer isn't present (e.g. asked about a channel
  with no rows), say so plainly instead of guessing.
- Write in clear, well-formatted markdown: a short summary first, then
  supporting detail (tables/bullet points as appropriate).
- Keep it focused on what was actually asked — don't dump every metric
  into every report.`;

export async function POST(req: Request) {
  if (!anthropic) {
    return new Response("ANTHROPIC_API_KEY is not configured", { status: 500 });
  }

  const body = (await req.json()) as { prompt?: string; demo?: boolean };
  const userPrompt = body.prompt?.trim();
  if (!userPrompt) {
    return new Response("Missing prompt", { status: 400 });
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
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Here is this business's current data:\n\n${digest}\n\n---\n\nReport request: ${userPrompt}`,
      },
    ],
  });

  const encoder = new TextEncoder();
  const body_ = new ReadableStream({
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

  return new Response(body_, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
