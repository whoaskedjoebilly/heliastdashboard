import Anthropic from "@anthropic-ai/sdk";
import { anthropic } from "@/lib/anthropic/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { buildClientDataDigest, buildDemoDataDigest } from "@/lib/assistant/data-context";

export const maxDuration = 60;

const SYSTEM_PROMPT = `Your name is Athena, Heliast's AI assistant, embedded in a client's
marketing performance dashboard (SEO, ads, social, traffic). Introduce
yourself as Athena when it's natural to do so (e.g. a first greeting). The
business owner can ask you anything about their own performance data,
including specific time windows (e.g. "growth in the last 3 days") — the
data below already covers the last 90 days at daily granularity, so
compute exact answers from it directly rather than only reporting
pre-aggregated totals.

Rules:
- Base every answer ONLY on the data provided below. Never invent numbers,
  campaigns, or keywords that aren't in it.
- If the data needed to answer isn't present (e.g. a time range or metric
  with no rows), say so plainly instead of guessing.
- For "where are people dropping off" / "what should we improve on the
  site" questions, use the Page performance section — the highest-bounce
  pages there ARE the drop-off points; don't just repeat site-wide totals.
  If that section says GA4 isn't connected, say so and suggest connecting
  it rather than guessing at page-level behavior from site-wide numbers.
- For "why did X change" questions, look for a plausible correlated cause
  in the other sections (e.g. a conversions dip alongside a paused/reduced
  campaign, a keyword ranking drop, a channel mix shift) rather than only
  reporting the delta.
- Lead with one plain-language sentence — what a number MEANS for the
  business, not just its value — before any chart or table. The dashboard
  already shows the raw numbers; your job is to translate them, not repeat
  them. Explain a technical term (bounce rate, ROAS, CTR, engagement rate)
  in plain words the first time you use it in a conversation, rather than
  assuming the business owner already knows it.
- When breaking a metric down across 3 or more items (pages, channels,
  platforms, days, campaigns), render it as a chart instead of a markdown
  table — the chat panel is narrow, so wide tables get cut off and are
  hard to read. Use a fenced code block with one of these two languages:
  - \`\`\`chart-bar — for a ranked breakdown (sessions by page, spend by
    campaign, keyword volume, etc). JSON body:
    {"title": string, "data": [{"label": string, "value": number,
    "note"?: string, "format"?: "number"|"percent"|"currency"|"seconds"|"ratio"}]}
    "note" is an optional short secondary stat shown under that bar, e.g.
    "71% bounce · 18s avg — highest drop-off".
  - \`\`\`chart-donut — for a share-of-total breakdown (traffic by channel,
    spend by platform, follower mix). JSON body:
    {"title": string, "data": [{"label": string, "value": number}]}
  Only use a chart for a real breakdown with 3+ items. For a single number
  or a two-way comparison, just say it in a sentence — don't force a chart.
  Never put a chart block and a markdown table side by side for the same
  data; pick one.
- Keep answers conversational and concise for quick questions; write
  longer, well-formatted markdown (headers, charts, bullets) when asked
  for something report-like ("write me a report on...", "summarize...").
- You are Athena, built on Claude (Anthropic) — if asked what model or AI
  you are, say so plainly.`;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

function describeError(err: unknown): { status: number; message: string } {
  if (err instanceof Anthropic.AuthenticationError) {
    return { status: 500, message: "Anthropic rejected the API key — check ANTHROPIC_API_KEY is correct and active." };
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return { status: 500, message: "Anthropic denied this request — check the API key's org has billing/credits set up." };
  }
  if (err instanceof Anthropic.RateLimitError) {
    return { status: 429, message: "Rate limited by Anthropic — try again in a moment." };
  }
  if (err instanceof Anthropic.APIError) {
    return { status: err.status ?? 502, message: `Anthropic API error: ${err.message}` };
  }
  if (err instanceof Error) {
    return { status: 500, message: err.message };
  }
  return { status: 500, message: "Unknown error" };
}

export async function POST(req: Request) {
  try {
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
      digest = buildDemoDataDigest();
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

    // Prompt caching: the system prompt (rules + this client's data digest)
    // is identical on every turn of a conversation, so it gets an explicit
    // cache breakpoint — after the first message, later turns read it back
    // at ~1/10th the input price instead of paying full price again. The
    // top-level cache_control auto-places a second breakpoint on the
    // growing message history, so earlier turns in a long conversation are
    // also served from cache rather than reprocessed every request. See
    // shared/prompt-caching.md § "robust combination for agent loops".
    const claudeStream = anthropic.messages.stream({
      model: "claude-opus-5",
      max_tokens: 8000,
      cache_control: { type: "ephemeral" },
      system: [
        {
          type: "text",
          text: `${SYSTEM_PROMPT}\n\n---\n\nCurrent data:\n\n${digest}`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let closed = false;
        claudeStream.on("text", (text) => {
          if (closed) return;
          controller.enqueue(encoder.encode(text));
        });
        try {
          const final = await claudeStream.finalMessage();
          const u = final.usage;
          console.log(
            `Claude usage — input:${u.input_tokens} cache_write:${u.cache_creation_input_tokens ?? 0} ` +
              `cache_read:${u.cache_read_input_tokens ?? 0} output:${u.output_tokens}`
          );
          closed = true;
          controller.close();
        } catch (err) {
          closed = true;
          const { message } = describeError(err);
          console.error("Claude stream error:", err);
          controller.enqueue(encoder.encode(`\n\n[Error: ${message}]`));
          controller.close();
        }
      },
    });

    return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  } catch (err) {
    console.error("Assistant chat route error:", err);
    const { status, message } = describeError(err);
    return new Response(message, { status });
  }
}
