import type { SupabaseClient } from "@supabase/supabase-js";
import { BUSINESS, CAMPAIGNS, KEYWORDS, SOCIAL_PLATFORMS } from "@/components/dashboard/mock-data";
import { humanizePagePath } from "@/lib/page-labels";

/** Fetches everything about one client from the dashboard_* tables and
 * serializes it into a compact text digest for a Claude prompt. Always
 * scoped to the caller-verified client_id — never accepts one from the
 * request body — so a report can only ever see its own client's data. */
export async function buildClientDataDigest(db: SupabaseClient, clientId: string): Promise<string> {
  const since90 = new Date();
  since90.setDate(since90.getDate() - 90);
  const since90Str = since90.toISOString().slice(0, 10);

  const [clientRes, trafficRes, keywordsRes, campaignsRes, socialRes, pagesRes] = await Promise.all([
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
    db
      .from("dashboard_ga4_pages")
      .select("date, page_path, sessions, engaged_sessions, bounce_rate, avg_engagement_sec, page_views")
      .eq("client_id", clientId)
      .gte("date", since90Str)
      .order("date", { ascending: true }),
  ]);

  const client = clientRes.data;
  const traffic = trafficRes.data ?? [];
  const keywords = keywordsRes.data ?? [];
  const campaigns = campaignsRes.data ?? [];
  const social = socialRes.data ?? [];
  const pages = pagesRes.data ?? [];

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
  lines.push("");

  lines.push(`## Page performance (GA4, last 90 days)`);
  if (pages.length === 0) {
    lines.push(
      "No page-level data yet — Google Analytics 4 isn't connected for this client, so questions about specific " +
        "pages, on-site drop-off, or bounce rate can't be answered yet. Site-wide traffic and conversion totals " +
        "above still work fine without it."
    );
  } else {
    const byPage = new Map<string, { sessions: number; pageViews: number; bounceWeighted: number; engagementWeighted: number }>();
    for (const row of pages) {
      const entry = byPage.get(row.page_path) ?? { sessions: 0, pageViews: 0, bounceWeighted: 0, engagementWeighted: 0 };
      const sessions = row.sessions ?? 0;
      entry.sessions += sessions;
      entry.pageViews += row.page_views ?? 0;
      entry.bounceWeighted += (row.bounce_rate ?? 0) * sessions;
      entry.engagementWeighted += (row.avg_engagement_sec ?? 0) * sessions;
      byPage.set(row.page_path, entry);
    }
    const aggregated = Array.from(byPage.entries()).map(([page_path, e]) => ({
      page_path,
      sessions: e.sessions,
      pageViews: e.pageViews,
      bounceRate: e.sessions > 0 ? Math.round((e.bounceWeighted / e.sessions) * 1000) / 10 : 0,
      avgEngagementSec: e.sessions > 0 ? Math.round((e.engagementWeighted / e.sessions) * 10) / 10 : 0,
    }));

    const topBySessions = [...aggregated].sort((a, b) => b.sessions - a.sessions).slice(0, 15);
    lines.push(`Top pages by sessions (${topBySessions.length} of ${aggregated.length} tracked pages):`);
    lines.push("page | sessions | page_views | bounce_rate | avg_engagement_sec");
    for (const p of topBySessions) {
      lines.push(`${humanizePagePath(p.page_path)} | ${p.sessions} | ${p.pageViews} | ${p.bounceRate}% | ${p.avgEngagementSec}s`);
    }
    lines.push("");

    const dropOff = aggregated
      .filter((p) => p.sessions >= 5)
      .sort((a, b) => b.bounceRate - a.bounceRate)
      .slice(0, 8);
    lines.push(`Highest-bounce pages (likely drop-off points, min 5 sessions):`);
    if (dropOff.length === 0) {
      lines.push("Not enough per-page traffic yet to identify drop-off points.");
    } else {
      lines.push("page | sessions | bounce_rate | avg_engagement_sec");
      for (const p of dropOff) {
        lines.push(`${humanizePagePath(p.page_path)} | ${p.sessions} | ${p.bounceRate}% | ${p.avgEngagementSec}s`);
      }
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
const signed = (n: number) => `${n >= 0 ? "+" : ""}${n}%`;

/** Precomputed totals for a window, so the assistant doesn't have to do
 * mental arithmetic over dozens of rows to answer "how's the last 7/30/90
 * days looking" — it can just read the number off, same windows the
 * dashboard's own 7d/30d/90d toggle uses. */
function summarizeWindow(label: string, values: number[], days: number, unit: string): string {
  const current = sum(values.slice(-days));
  const prior = sum(values.slice(-2 * days, -days));
  return `${label}: ${current} ${unit} (${signed(pctChange(current, prior))} vs prior ${days}d)`;
}

/** Builds a digest with real day-by-day rows (same shape as
 * buildClientDataDigest) from the dashboard's built-in demo/mock data, used
 * when a demo-account session asks the assistant a question — there's no
 * real Supabase client row to query, but the assistant still needs actual
 * daily numbers to answer things like "growth in the last 3 days". */
export function buildDemoDataDigest(): string {
  // Generate 180 days internally so a true "last 90 vs prior 90" comparison
  // is possible, but only print the most recent 90 as raw rows — the
  // "Quick totals" section below carries the 7d/30d/90d numbers so the
  // assistant isn't stuck doing that arithmetic itself over ~90 rows.
  const longDays = 180;
  const shownDays = 90;
  const allDates = lastNDates(longDays);
  const allSessions = genDailySeries(longDays, 380, 0.3, 55, 1);
  const allConversions = genDailySeries(longDays, 9, 0.025, 3, 2);
  const dates = allDates.slice(-shownDays);
  const sessions = allSessions.slice(-shownDays);
  const conversions = allConversions.slice(-shownDays);

  const lines: string[] = [];
  lines.push(`# Client: ${BUSINESS.name} (${BUSINESS.plan} plan)`);
  lines.push("");

  lines.push("## Quick totals (precomputed — use these directly for \"last N days\" questions)");
  lines.push(summarizeWindow("Sessions, last 7 days", allSessions, 7, "sessions"));
  lines.push(summarizeWindow("Sessions, last 30 days", allSessions, 30, "sessions"));
  lines.push(summarizeWindow("Sessions, last 90 days", allSessions, 90, "sessions"));
  lines.push(summarizeWindow("Conversions, last 7 days", allConversions, 7, "conversions"));
  lines.push(summarizeWindow("Conversions, last 30 days", allConversions, 30, "conversions"));
  lines.push(summarizeWindow("Conversions, last 90 days", allConversions, 90, "conversions"));
  lines.push("");

  lines.push(`## Daily traffic (last ${shownDays} days, ${shownDays} rows)`);
  lines.push("date | sessions | conversions");
  for (let i = 0; i < shownDays; i++) {
    lines.push(`${dates[i]} | ${sessions[i]} | ${conversions[i]}`);
  }
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

  lines.push(`## Daily social stats (last ${shownDays} days, ${shownDays * SOCIAL_PLATFORMS.length} rows)`);
  lines.push("date | platform | followers | engagement_rate");
  SOCIAL_PLATFORMS.forEach((p, idx) => {
    const base = Math.round(p.followers * 0.85);
    const drift = (p.followers - base) / longDays;
    const allFollowers = genDailySeries(longDays, base, drift, Math.max(3, base * 0.004), 100 + idx * 7);
    const followers = allFollowers.slice(-shownDays);
    for (let i = 0; i < shownDays; i++) {
      lines.push(`${dates[i]} | ${p.platform} | ${followers[i]} | ${p.engagement}%`);
    }
  });
  lines.push("");

  // Fixed, plausible per-page stats — deliberately gives the cart page a
  // much higher bounce rate than the rest, so "where are people dropping
  // off" has a real, specific answer to point to in demo mode too.
  lines.push(`## Page performance (GA4, last 30 days)`);
  lines.push("page | sessions | page_views | bounce_rate | avg_engagement_sec");
  const pageStats: { page: string; sessions: number; views: number; bounce: number; engagement: number }[] = [
    { page: "/", sessions: 4820, views: 6100, bounce: 38, engagement: 42 },
    { page: "/products/fl-41-glasses", sessions: 3140, views: 4400, bounce: 31, engagement: 68 },
    { page: "/collections/all", sessions: 1960, views: 2500, bounce: 44, engagement: 35 },
    { page: "/products/blackout-eye-mask", sessions: 1420, views: 1900, bounce: 34, engagement: 55 },
    { page: "/blog/light-sensitivity-guide", sessions: 980, views: 1150, bounce: 52, engagement: 61 },
    { page: "/cart", sessions: 640, views: 780, bounce: 71, engagement: 18 },
    { page: "/pages/about", sessions: 410, views: 460, bounce: 58, engagement: 22 },
  ];
  for (const p of pageStats) {
    lines.push(`${humanizePagePath(p.page)} | ${p.sessions} | ${p.views} | ${p.bounce}% | ${p.engagement}s`);
  }

  return lines.join("\n");
}
