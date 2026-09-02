import type { SupabaseClient } from "@supabase/supabase-js";

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

/** Small hand-written digest matching the dashboard's built-in demo/mock
 * data, used when a demo-account session asks for a report (no real
 * Supabase client row exists to query). */
export const DEMO_DATA_DIGEST = `# Client: MigraineMend (Premium plan)

## Overview (last 30 days)
Sessions: 12,480 (+9% vs prior 30d). Conversions: 318 (+14% vs prior 30d).
Ad spend: $4,630 (-6% vs prior 30d). Blended ROAS: 3.6x.
Traffic channel split: Organic search 44%, Paid social 27%, Paid search 18%, Direct 11%.

## Top keywords
migraine relief glasses | position 3 (+2) | volume 2.4k/mo
fl-41 tinted glasses | position 1 (flat) | volume 1.1k/mo
blackout sleep mask migraine | position 5 (-1) | volume 880/mo
light sensitivity headache relief | position 8 (+4) | volume 640/mo
best glasses for migraines | position 6 (+1) | volume 1.9k/mo

## Active campaigns
Meta — FL-41 Retarget | Meta Ads | spend $1,240 | ROAS 4.8x | healthy
Google — Migraine Relief Search | Google Ads | spend $2,100 | ROAS 3.2x | healthy
Meta — Cold Prospecting | Meta Ads | spend $980 | ROAS 1.6x | needs attention
Google — Brand Defense | Google Ads | spend $310 | ROAS 6.1x | healthy

## Social
Instagram: 4,820 followers (+6.2%), 3.8% engagement
TikTok: 2,150 followers (+14.1%), 6.4% engagement
Facebook: 1,990 followers (+1.4%), 1.9% engagement`;
