// Raw rows for the demo account's report builder — reuses the same long
// synthetic series the rest of the demo dashboard is built from
// (mock-data.ts) so a custom report's numbers line up with what the
// Overview/Ads/Social tabs already show, rather than a separate,
// disconnected set of fake numbers.
import {
  CAMPAIGNS,
  CHANNEL_SPLIT,
  CONVERSIONS_LONG,
  PLATFORM_ENGAGEMENT,
  PLATFORM_SERIES_LONG,
  TRAFFIC_LONG,
  genTrend,
} from "@/components/dashboard/mock-data";
import type { CampaignRawRow, PageRawRow, SocialRawRow, TrafficRawRow } from "./registry";

function lastNDates(n: number): string[] {
  const out: string[] = [];
  const today = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** No real per-channel daily table exists in the demo data (CHANNEL_SPLIT is
 * a static 30-day percentage split) — split each day's total sessions
 * across channels by that same split so a channel-grouped report is at
 * least internally consistent with the Overview donut chart. */
export function demoTrafficRows(days: number): TrafficRawRow[] {
  const dates = lastNDates(days);
  const sessions = TRAFFIC_LONG.slice(-days);
  const conversions = CONVERSIONS_LONG.slice(-days);
  const rows: TrafficRawRow[] = [];
  for (let i = 0; i < days; i++) {
    for (const c of CHANNEL_SPLIT) {
      const share = c.value / 100;
      rows.push({
        date: dates[i],
        channel: c.channel,
        sessions: Math.round(sessions[i].value * share),
        conversions: Math.round(conversions[i].value * share),
      });
    }
  }
  return rows;
}

export function demoCampaignRows(): CampaignRawRow[] {
  return CAMPAIGNS.map((c) => ({ name: c.name, platform: c.channel, status: c.status, spend: c.spend, roas: c.roas }));
}

export function demoSocialRows(days: number): SocialRawRow[] {
  const dates = lastNDates(days);
  const rows: SocialRawRow[] = [];
  for (const [platform, series] of Object.entries(PLATFORM_SERIES_LONG)) {
    const slice = series.slice(-days);
    for (let i = 0; i < days; i++) {
      rows.push({ date: dates[i], platform, followers: slice[i].value, engagement_rate: PLATFORM_ENGAGEMENT[platform] ?? 0 });
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

export function demoPageRows(days: number): PageRawRow[] {
  const dates = lastNDates(days);
  const rows: PageRawRow[] = [];
  for (const p of DEMO_PAGES) {
    const sessions = genTrend(days, p.base, p.drift, p.noise);
    for (let i = 0; i < days; i++) {
      rows.push({
        date: dates[i],
        page_path: p.path,
        sessions: sessions[i].value,
        page_views: Math.round(sessions[i].value * p.viewsPerSession),
        bounce_rate: p.bounce,
        avg_engagement_sec: p.engagement,
      });
    }
  }
  return rows;
}
