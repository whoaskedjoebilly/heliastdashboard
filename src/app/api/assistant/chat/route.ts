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
- The CRM / Leads pipeline section covers what happens AFTER a conversion —
  a named lead moving through New -> Contacted -> Qualified ->
  Appointment/Estimate -> Won/Lost, not just a raw conversion count. Use it
  for questions like "which channel generated the most customers", "how
  many Google Ads leads actually closed", "what's our cost per customer",
  or "show me leads that haven't been contacted" — the per-source table
  already has cost-per-lead/cost-per-customer computed, and the
  not-yet-contacted list is broken out separately, so don't recompute
  either from scratch. If a cost figure shows "n/a", that source has no
  paid-spend counterpart (organic/referral/direct) — say so rather than
  guessing a cost.
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
- Default to short, direct answers: 1-3 sentences, lead with the actual
  answer in the first sentence. Someone asking "how's traffic doing" wants
  the number and a verdict, not a walkthrough of everything you checked.
  Cut narration like "Let me look at...", "Based on the data provided...",
  "Looking at your traffic...", "I can see that..." — just answer. Only
  add a second or third sentence if it's the specific cause, the specific
  next step, or a number that changes what the first sentence means. Skip
  restating context the person already knows (their own business name,
  that they asked about traffic, etc.).
- Only go long — headers, multiple sections, bullets — when the person
  explicitly asks for something report-shaped: "write me a report",
  "summarize this month", "give me a full breakdown". A plain question
  gets a plain-spoken answer, not a report, even if the underlying data
  has a lot going on. A chart block (see above) is not "going long" — it
  can accompany a short answer.
- You are Athena, built on Claude (Anthropic) — if asked what model or AI
  you are, say so plainly.`;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// Client-facing messages are deliberately generic — details (key problems,
// billing state, upstream error text) go to server logs only.
function describeError(err: unknown): { status: number; message: string } {
  if (err instanceof Anthropic.RateLimitError) {
    return { status: 429, message: "The assistant is busy right now — try again in a moment." };
  }
  return { status: 500, message: "The assistant is unavailable right now." };
}

// Best-effort per-instance rate limiter. Serverless instances don't share
// memory, so this is a speed bump against casual abuse of the unauthenticated
// demo mode, not a hard guarantee — pair with an Anthropic spend limit.
const hits = new Map<string, number[]>();
function rateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return true;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  }
  return false;
}

const MAX_MESSAGES = 30;
const MAX_MESSAGE_CHARS = 4000;

export async function POST(req: Request) {
  try {
    if (!anthropic) {
      console.error("ANTHROPIC_API_KEY is not configured");
      return new Response("The assistant is unavailable right now.", { status: 500 });
    }

    if (!req.headers.get("content-type")?.includes("application/json")) {
      return new Response("Expected application/json", { status: 415 });
    }
    let body: { messages?: ChatMessage[]; demo?: boolean };
    try {
      body = await req.json();
    } catch {
      return new Response("Invalid JSON body", { status: 400 });
    }
    const messages = body.messages;
    const valid =
      Array.isArray(messages) &&
      messages.length > 0 &&
      messages.length <= MAX_MESSAGES &&
      messages[messages.length - 1].role === "user" &&
      messages.every(
        (m) =>
          m &&
          (m.role === "user" || m.role === "assistant") &&
          typeof m.content === "string" &&
          m.content.length > 0 &&
          m.content.length <= MAX_MESSAGE_CHARS
      );
    if (!valid || !messages) {
      return new Response(
        `messages must be 1-${MAX_MESSAGES} items, each with role user|assistant and content up to ${MAX_MESSAGE_CHARS} chars, ending in a user message`,
        { status: 400 }
      );
    }
    const ip = (req.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();

    let digest: string;

    if (body.demo) {
      // Unauthenticated: tight limits since every call spends real money.
      if (rateLimited(`demo:${ip}`, 8, 10 * 60 * 1000)) {
        return new Response("Demo rate limit reached — please try again in a few minutes.", { status: 429 });
      }
      digest = buildDemoDataDigest();
    } else {
      if (!supabaseAdmin) {
        console.error("SUPABASE_SERVICE_ROLE_KEY is not configured");
        return new Response("The assistant is unavailable right now.", { status: 500 });
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
      if (rateLimited(`user:${userData.user.id}`, 40, 10 * 60 * 1000)) {
        return new Response("Rate limit reached — please slow down.", { status: 429 });
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
      max_tokens: body.demo ? 1500 : 4000,
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
