import type { SupabaseClient } from "@supabase/supabase-js";
import { BUSINESS, CAMPAIGNS, KEYWORDS, SOCIAL_PLATFORMS } from "@/components/dashboard/mock-data";

/** Fetches everything about one client from the dashboard_* tables and
 * serializes it into a compact text digest for a Claude prompt. Always
 * scoped to the caller-verified client_id — never accepts one from the
 * request body — so a report can only ever see its own client's data. */
export async function buildClientDataDigest(db: SupabaseClient, clientId: string): Promise<string> {
  const since90 = new Date();
  since90.setDate(since90.getDate() - 90);
  const since90Str = since90.toISOString().slice(0, 10);

  const [clientRes, trafficRes, keywordsRes, campaignsRes, socialRes] = await Promise.all([
    db.from("dashboard_clients").select("name, plan, created_at").eq("id", clientId).maybeSingle(),
    db
      .from("dashboard_daily_traffic")
      .select("date, sessions, conversions, channel")
      .eq("client_id", clientId)
      .gte("date", since90Str)
      .order("date", { ascending: true }),
    db
      .from("dashboard_keyword_rankings")
      .select("keyword, position, search_volume, checked_at")
      .eq("client_id", clientId)
      .order("checked_at", { ascending: false })
      .limit(200),
    db
      .from("dashboard_ad_campaigns")
      .select("name, platform, spend, roas, status, synced_at")
      .eq("client_id", clientId)
      .order("synced_at", { ascending: false })
      .limit(50),
    db
      .from("dashboard_social_stats")
      .select("platform, followers, engagement_rate, date")
      .eq("client_id", clientId)
      .gte("date", since90Str)
      .order("date", { ascending: true }),
  ]);

  const client = clientRes.data;
  const traffic = trafficRes.data ?? [];
  const keywords = keywordsRes.data ?? [];
  const campaigns = campaignsRes.data ?? [];
  const social = socialRes.data ?? [];

  const lines: string[] = [];
  lines.push(`# Client: ${client?.name ?? "Unknown"} (${client?.plan ?? "no plan"} plan)`);
  lines.push("");

  lines.push(`## Daily traffic (last 90 days, ${traffic.length} rows)`);
  if (traffic.length === 0) {
    lines.push("No traffic data recorded yet.");
  } else {
    lines.push("date | channel | sessions | conversions");
    for (const row of traffic) {
      lines.push(`${row.date} | ${row.channel ?? "unknown"} | ${row.sessions ?? 0} | ${row.conversions ?? 0}`);
    }
  }
  lines.push("");

  lines.push(`## Keyword rankings (most recent ${keywords.length} readings)`);
  if (keywords.length === 0) {
    lines.push("No tracked keywords yet.");
  } else {
    lines.push("keyword | position | search_volume | checked_at");
    for (const row of keywords) {
      lines.push(`${row.keyword} | ${row.position} | ${row.search_volume} | ${row.checked_at}`);
    }
  }
  lines.push("");

  lines.push(`## Ad campaigns (${campaigns.length})`);
  if (campaigns.length === 0) {
    lines.push("No ad campaigns yet.");
  } else {
    lines.push("name | platform | spend | roas | status | synced_at");
    for (const row of campaigns) {
      lines.push(`${row.name} | ${row.platform} | $${row.spend} | ${row.roas}x | ${row.status} | ${row.synced_at}`);
    }
  }
  lines.push("");

  lines.push(`## Social stats (last 90 days, ${social.length} rows)`);
  if (social.length === 0) {
    lines.push("No social data yet.");
  } else {
    lines.push("date | platform | followers | engagement_rate");
    for (const row of social) {
      lines.push(`${row.date} | ${row.platform} | ${row.followers} | ${row.engagement_rate}%`);
    }
  }

  return lines.join("\n");
}

// Deterministic pseudo-random in [0, 1), seeded by a plain number — keeps
// the demo digest's daily rows stable across requests (so prompt caching
// still hits, and answers don't shift between turns of the same chat)
// without needing to persist generated data anywhere.
function pseudoRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function genDailySeries(days: number, base: number, drift: number, noise: number, seed: number): number[] {
  const out: number[] = [];
  let v = base;
  for (let i = 0; i < days; i++) {
    v = Math.max(0, v + drift + (pseudoRandom(seed + i) - 0.5) * noise);
    out.push(Math.round(v));
  }
  return out;
}

function lastNDates(n: number): string[] {
  const out: string[] = [];
  const today = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
const pctChange = (current: number, prior: number) => (prior === 0 ? 0 : Math.round(((current - prior) / prior) * 100));

/** Builds a digest with real day-by-day rows (same shape as
 * buildClientDataDigest) from the dashboard's built-in demo/mock data, used
 * when a demo-account session asks the assistant a question — there's no
 * real Supabase client row to query, but the assistant still needs actual
 * daily numbers to answer things like "growth in the last 3 days". */
export function buildDemoDataDigest(): string {
  const days = 90;
  const dates = lastNDates(days);
  const sessions = genDailySeries(days, 380, 0.6, 55, 1);
  const conversions = genDailySeries(days, 9, 0.05, 3, 2);

  const lines: string[] = [];
  lines.push(`# Client: ${BUSINESS.name} (${BUSINESS.plan} plan)`);
  lines.push("");

  lines.push(`## Daily traffic (last ${days} days, ${days} rows)`);
  lines.push("date | sessions | conversions");
  for (let i = 0; i < days; i++) {
    lines.push(`${dates[i]} | ${sessions[i]} | ${conversions[i]}`);
  }
  const last30Sessions = sum(sessions.slice(-30));
  const prior30Sessions = sum(sessions.slice(-60, -30));
  const last30Conversions = sum(conversions.slice(-30));
  const prior30Conversions = sum(conversions.slice(-60, -30));
  lines.push("");
  lines.push(
    `Last 30 days total: ${last30Sessions} sessions (${pctChange(last30Sessions, prior30Sessions) >= 0 ? "+" : ""}${pctChange(last30Sessions, prior30Sessions)}% vs prior 30d), ` +
      `${last30Conversions} conversions (${pctChange(last30Conversions, prior30Conversions) >= 0 ? "+" : ""}${pctChange(last30Conversions, prior30Conversions)}% vs prior 30d).`
  );
  lines.push("");

  lines.push(`## Keyword rankings (most recent ${KEYWORDS.length} readings)`);
  lines.push("keyword | position | delta | search_volume");
  for (const k of KEYWORDS) {
    lines.push(`${k.term} | ${k.pos} | ${k.delta > 0 ? "+" : ""}${k.delta} | ${k.volume}/mo`);
  }
  lines.push("");

  lines.push(`## Ad campaigns (${CAMPAIGNS.length})`);
  lines.push("name | platform | spend | roas | status");
  for (const c of CAMPAIGNS) {
    lines.push(`${c.name} | ${c.channel} | $${c.spend} | ${c.roas}x | ${c.status}`);
  }
  lines.push("");

  lines.push(`## Daily social stats (last ${days} days, ${days * SOCIAL_PLATFORMS.length} rows)`);
  lines.push("date | platform | followers | engagement_rate");
  SOCIAL_PLATFORMS.forEach((p, idx) => {
    const base = Math.round(p.followers * 0.85);
    const drift = (p.followers - base) / days;
    const followers = genDailySeries(days, base, drift, Math.max(3, base * 0.004), 100 + idx * 7);
    for (let i = 0; i < days; i++) {
      lines.push(`${dates[i]} | ${p.platform} | ${followers[i]} | ${p.engagement}%`);
    }
  });

  return lines.join("\n");
}
