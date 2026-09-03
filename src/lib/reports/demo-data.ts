// Raw rows for the demo account's report builder — reuses the same long
// synthetic series the rest of the demo dashboard is built from
// (mock-data.ts) so a custom report's numbers line up with what the
// Overview/Ads/Social tabs already show, rather than a separate,
// disconnected set of fake numbers.
//
// Every dataset here is looked up by calendar date rather than "last N
// days", since the report builder lets someone pick an arbitrary custom
// window (e.g. a specific two weeks last month) — not just a trailing
// range from today.
import {
  CAMPAIGNS,
  CHANNEL_SPLIT,
  CONVERSIONS_LONG,
  PLATFORM_ENGAGEMENT,
  PLATFORM_SERIES_LONG,
  TRAFFIC_LONG,
  genTrend,
} from "@/components/dashboard/mock-data";
import type { TrendPoint } from "@/components/dashboard/types";
import type { CampaignRawRow, PageRawRow, SocialRawRow, TrafficRawRow } from "./registry";

function datesInRange(startStr: string, endStr: string): string[] {
  const out: string[] = [];
  let d = parseDateStr(startStr);
  const end = parseDateStr(endStr);
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10));
    d = new Date(d);
    d.setDate(d.getDate() + 1);
  }
  return out;
}

function parseDateStr(s: string): Date {
  const [y, m, dd] = s.split("-").map(Number);
  return new Date(y, m - 1, dd);
}

/** The demo LONG series (TRAFFIC_LONG etc.) are 180-day arrays anchored so
 * the last entry is "today" — this maps an arbitrary calendar date back to
 * that array's index, clamping to the nearest edge for dates outside the
 * 180-day window (a demo-data limitation; real accounts have no such
 * window since they just query whatever Supabase has stored). */
function seriesValue(series: TrendPoint[], dateStr: string): number {
  const target = parseDateStr(dateStr);
  target.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysAgo = Math.round((today.getTime() - target.getTime()) / 86400000);
  const idx = series.length - 1 - daysAgo;
  return series[Math.min(series.length - 1, Math.max(0, idx))].value;
}

/** No real per-channel daily table exists in the demo data (CHANNEL_SPLIT is
 * a static 30-day percentage split) — split each day's total sessions
 * across channels by that same split so a channel-grouped report is at
 * least internally consistent with the Overview donut chart. */
export function demoTrafficRows(startStr: string, endStr: string): TrafficRawRow[] {
  const dates = datesInRange(startStr, endStr);
  const rows: TrafficRawRow[] = [];
  for (const date of dates) {
    const sessions = seriesValue(TRAFFIC_LONG, date);
    const conversions = seriesValue(CONVERSIONS_LONG, date);
    for (const c of CHANNEL_SPLIT) {
      const share = c.value / 100;
      rows.push({ date, channel: c.channel, sessions: Math.round(sessions * share), conversions: Math.round(conversions * share) });
    }
  }
  return rows;
}

export function demoCampaignRows(): CampaignRawRow[] {
  return CAMPAIGNS.map((c) => ({ name: c.name, platform: c.channel, status: c.status, spend: c.spend, roas: c.roas }));
}

export function demoSocialRows(startStr: string, endStr: string): SocialRawRow[] {
  const dates = datesInRange(startStr, endStr);
  const rows: SocialRawRow[] = [];
  for (const [platform, series] of Object.entries(PLATFORM_SERIES_LONG)) {
    for (const date of dates) {
      rows.push({ date, platform, followers: seriesValue(series, date), engagement_rate: PLATFORM_ENGAGEMENT[platform] ?? 0 });
    }
  }
  return rows;
}

const DEMO_PAGES = [
  { path: "/", base: 160, drift: 0.3, noise: 30, bounce: 38, engagement: 42, viewsPerSession: 1.27 },
  { path: "/products/fl-41-glasses", base: 105, drift: 0.4, noise: 22, bounce: 31, engagement: 68, viewsPerSession: 1.4 },
  { path: "/collections/all", base: 65, drift: 0.1, noise: 16, bounce: 44, engagement: 35, viewsPerSession: 1.28 },
  { path: "/products/blackout-eye-mask", base: 47, drift: 0.15, noise: 13, bounce: 34, engagement: 55, viewsPerSession: 1.34 },
  { path: "/blog/light-sensitivity-guide", base: 33, drift: 0.05, noise: 10, bounce: 52, engagement: 61, viewsPerSession: 1.17 },
  { path: "/cart", base: 21, drift: 0.05, noise: 7, bounce: 71, engagement: 18, viewsPerSession: 1.22 },
  { path: "/pages/about", base: 14, drift: 0.02, noise: 5, bounce: 58, engagement: 22, viewsPerSession: 1.12 },
];

// Generated once (180-day, anchored to today like the LONG series above) so
// every date maps to a stable value regardless of which window is queried.
const PAGE_SESSIONS_LONG: Record<string, TrendPoint[]> = Object.fromEntries(
  DEMO_PAGES.map((p) => [p.path, genTrend(180, p.base, p.drift, p.noise)])
);

export function demoPageRows(startStr: string, endStr: string): PageRawRow[] {
  const dates = datesInRange(startStr, endStr);
  const rows: PageRawRow[] = [];
  for (const p of DEMO_PAGES) {
    const series = PAGE_SESSIONS_LONG[p.path];
    for (const date of dates) {
      const sessions = seriesValue(series, date);
      rows.push({
        date,
        page_path: p.path,
        sessions,
        page_views: Math.round(sessions * p.viewsPerSession),
        bounce_rate: p.bounce,
        avg_engagement_sec: p.engagement,
      });
    }
  }
  return rows;
}
