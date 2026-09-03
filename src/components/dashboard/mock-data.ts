// Mock data — stands in for what would come from Google Search Console,
// Meta Ads, and Google Ads APIs once this is wired to real accounts (see
// dashboard-live-setup.md Phase 8).
import type {
  Business,
  CampaignRow,
  ChannelSplit,
  KeywordRow,
  LiveLocation,
  SeoHealth,
  SocialPlatformStat,
  TopPost,
  TrendPoint,
  Visitor,
} from "./types";

export const DEMO_ACCOUNT = { email: "team@migrainemend.com", password: "demo1234" };

export const BUSINESS: Business = { name: "MigraineMend", plan: "Premium", since: "Mar 2026" };

export function genTrend(days: number, base: number, drift: number, noise: number, decimals = 0): TrendPoint[] {
  const out: TrendPoint[] = [];
  const scale = 10 ** decimals;
  let v = base;
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    v = Math.max(0, v + drift + (Math.random() - 0.5) * noise);
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    out.push({
      date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      value: Math.round(v * scale) / scale,
    });
  }
  return out;
}

/** Like genTrend, but for ratio metrics (ROAS) that shouldn't wander
 * indefinitely — genTrend's `v` carries forward day to day (a random walk),
 * which is right for a count that can trend up or down over a business's
 * lifetime, but wrong for a ratio: over 180 days that walk can drift the
 * value arbitrarily far from its baseline (e.g. a "3.6x ROAS" business
 * randomly ending up at 0.5x). This instead samples each day independently
 * around `base`, so it stays bounded — day-to-day noise without runaway
 * drift. */
export function genStationary(days: number, base: number, noise: number, decimals = 0): TrendPoint[] {
  const out: TrendPoint[] = [];
  const scale = 10 ** decimals;
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const v = Math.max(0, base + (Math.random() - 0.5) * noise);
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    out.push({
      date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      value: Math.round(v * scale) / scale,
    });
  }
  return out;
}

// 180-day canonical series so the 7d/30d/90d range toggle has a real prior
// window to compare against even at the 90-day setting (90d current +
// 90d prior = 180d of history needed).
export const TRAFFIC_LONG: TrendPoint[] = genTrend(180, 420, 3.2, 46);
export const CONVERSIONS_LONG: TrendPoint[] = genTrend(180, 11, 0.09, 3);

export const TRAFFIC: TrendPoint[] = TRAFFIC_LONG.slice(-30);
export const CONVERSIONS: TrendPoint[] = CONVERSIONS_LONG.slice(-30);

export interface RangeConfigLike {
  length: number;
  endOffset: number;
  trendLength: number;
}

export interface RangeWindow {
  trend: TrendPoint[];
  total: number;
  deltaPct: number;
}

/** Slices a long trend series (oldest first, last element = today) into the
 * window described by a RANGE_CONFIG entry and computes its total plus %
 * change against the immediately preceding window of the same length —
 * used to make the today/yesterday/7d/30d/90d range toggle show genuinely
 * different numbers instead of the same fixed window regardless of
 * selection. `config` mirrors lib/dashboard-data.ts's RANGE_CONFIG so the
 * demo dashboard windows the same way a real one does. The chart trend
 * uses `trendLength`, which is wider than `length` for "today"/"yesterday"
 * (a single point can't draw a line) — see RANGE_CONFIG's doc comment. */
export function windowMetrics(long: TrendPoint[], config: RangeConfigLike): RangeWindow {
  const { length, endOffset, trendLength } = config;
  const end = long.length - endOffset;
  const current = long.slice(end - length, end);
  const prior = long.slice(end - 2 * length, end - length);
  const total = current.reduce((a, p) => a + p.value, 0);
  const priorTotal = prior.reduce((a, p) => a + p.value, 0);
  const deltaPct = priorTotal === 0 ? (total > 0 ? 100 : 0) : Math.round(((total - priorTotal) / priorTotal) * 1000) / 10;
  const trend = long.slice(end - trendLength, end);
  return { trend, total, deltaPct };
}

export interface EndpointWindow {
  trend: TrendPoint[];
  value: number;
  priorValue: number;
  deltaPct: number;
}

/** Same idea as windowMetrics, but for "stock" metrics (follower counts)
 * where summing daily values would be meaningless — picks the value as of
 * the window's end day and compares it to the value `length` days earlier,
 * i.e. "growth over the selected period". See dashboard-data.ts's
 * useSocialData for the real-account equivalent. */
export function endpointWindow(long: TrendPoint[], config: RangeConfigLike): EndpointWindow {
  const { length, endOffset, trendLength } = config;
  const end = long.length - endOffset;
  const currentIdx = end - 1;
  const priorIdx = end - 1 - length;
  const value = long[currentIdx]?.value ?? 0;
  const priorValue = long[priorIdx]?.value ?? value;
  const deltaPct = priorValue > 0 ? Math.round(((value - priorValue) / priorValue) * 1000) / 10 : 0;
  const trend = long.slice(end - trendLength, end);
  return { trend, value, priorValue, deltaPct };
}

/** For a ratio metric (ROAS) where neither summing nor an endpoint lookup
 * makes sense — averages the window instead. */
export function windowAverage(long: TrendPoint[], config: RangeConfigLike): RangeWindow {
  const { length, endOffset, trendLength } = config;
  const end = long.length - endOffset;
  const current = long.slice(end - length, end);
  const prior = long.slice(end - 2 * length, end - length);
  const avg = (points: TrendPoint[]) => (points.length === 0 ? 0 : points.reduce((a, p) => a + p.value, 0) / points.length);
  const total = avg(current);
  const priorTotal = avg(prior);
  const deltaPct = priorTotal === 0 ? 0 : Math.round(((total - priorTotal) / priorTotal) * 1000) / 10;
  const trend = long.slice(end - trendLength, end);
  return { trend, total, deltaPct };
}

export const CHANNEL_SPLIT: ChannelSplit[] = [
  { channel: "Organic search", value: 44 },
  { channel: "Paid social", value: 27 },
  { channel: "Paid search", value: 18 },
  { channel: "Direct", value: 11 },
];

export const KEYWORDS: KeywordRow[] = [
  { term: "migraine relief glasses", pos: 3, delta: 2, volume: "2.4k" },
  { term: "fl-41 tinted glasses", pos: 1, delta: 0, volume: "1.1k" },
  { term: "blackout sleep mask migraine", pos: 5, delta: -1, volume: "880" },
  { term: "light sensitivity headache relief", pos: 8, delta: 4, volume: "640" },
  { term: "best glasses for migraines", pos: 6, delta: 1, volume: "1.9k" },
];

export const CAMPAIGNS: CampaignRow[] = [
  { name: "Meta — FL-41 Retarget", channel: "Meta Ads", spend: 1240, roas: 4.8, status: "healthy" },
  { name: "Google — Migraine Relief Search", channel: "Google Ads", spend: 2100, roas: 3.2, status: "healthy" },
  { name: "Meta — Cold Prospecting", channel: "Meta Ads", spend: 980, roas: 1.6, status: "watch" },
  { name: "Google — Brand Defense", channel: "Google Ads", spend: 310, roas: 6.1, status: "healthy" },
];

export const SEO_HEALTH: SeoHealth = { indexed: 128, crawlErrors: 2, avgPosition: 11.4, backlinks: 342 };

// Pages indexed and backlinks are "stock" metrics (a running count, like
// followers) that genuinely do grow over weeks — unlike crawl errors or
// avg. position, which don't have a meaningful long-run drift story — so
// these two get long series windowed with endpointWindow. Ends near
// SEO_HEALTH's values so the two stay roughly in sync.
export const INDEXED_PAGES_LONG: TrendPoint[] = genTrend(180, 90, 0.45, 3);
export const BACKLINKS_LONG: TrendPoint[] = genTrend(180, 260, 0.46, 4);

// Daily ad spend so "Total spend" isn't frozen at the same number regardless
// of the selected range — a genuine flow metric like sessions/conversions,
// windowed the same way (sum over the window vs. the prior window).
export const AD_SPEND_LONG: TrendPoint[] = genTrend(180, 148, 0.06, 26);

// Daily blended ROAS — a ratio, so it's neither summed (windowMetrics) nor
// read as a running total (endpointWindow); the window's *average* is what
// a "ROAS over the last 7 days" figure means, via windowAverage.
export const ROAS_LONG: TrendPoint[] = genStationary(180, 3.6, 1.2, 1);

// Per-platform 180-day follower series so the range toggle can show real
// "growth over the selected period" numbers on the Social tab (a follower
// count is a stock metric — see endpointWindow — not something to sum).
export const PLATFORM_SERIES_LONG: Record<string, TrendPoint[]> = {
  Instagram: genTrend(180, 4000, 4.6, 12),
  TikTok: genTrend(180, 1500, 3.6, 18),
  Facebook: genTrend(180, 1900, 1.4, 6),
};
export const PLATFORM_ENGAGEMENT: Record<string, number> = { Instagram: 3.8, TikTok: 6.4, Facebook: 1.9 };

export const FOLLOWERS_LONG: TrendPoint[] = PLATFORM_SERIES_LONG.Instagram.map((point, i) => ({
  date: point.date,
  value: Object.values(PLATFORM_SERIES_LONG).reduce((a, series) => a + series[i].value, 0),
}));
export const FOLLOWERS_TREND: TrendPoint[] = FOLLOWERS_LONG.slice(-30);

export const SOCIAL_PLATFORMS: SocialPlatformStat[] = Object.entries(PLATFORM_SERIES_LONG).map(([platform, series]) => {
  const latest = series[series.length - 1].value;
  const prior = series[series.length - 2].value;
  return {
    platform,
    followers: latest,
    growth: latest - prior,
    delta: prior > 0 ? Math.round(((latest - prior) / prior) * 1000) / 10 : 0,
    engagement: PLATFORM_ENGAGEMENT[platform] ?? 0,
  };
});

export const TOP_POSTS: TopPost[] = [
  { caption: "Behind the scenes: how FL-41 tint actually works", platform: "Instagram", reach: "18.4k", saves: 640 },
  { caption: "POV: your first migraine-free flight", platform: "TikTok", reach: "52.1k", saves: 1200 },
  { caption: "5 light triggers you didn't know about", platform: "Instagram", reach: "9.8k", saves: 310 },
];

// Pools used to simulate a live visitor feed — stands in for what would come
// from a real-time pixel/websocket connection once this is wired to the
// actual site (see dashboard-live-setup.md Phase 9).
export const LIVE_PAGES = [
  "/",
  "/products/fl-41-glasses",
  "/products/blackout-eye-mask",
  "/collections/all",
  "/blog/light-sensitivity-guide",
  "/pages/about",
  "/cart",
];

// Locations weighted toward MigraineMend's actual US customer base, with a
// handful of international cities so the globe has something to show.
export const LIVE_LOCATIONS: LiveLocation[] = [
  { name: "Austin, TX", lat: 30.27, lng: -97.74, weight: 7 },
  { name: "Dallas, TX", lat: 32.78, lng: -96.8, weight: 6 },
  { name: "Waco, TX", lat: 31.55, lng: -97.15, weight: 5 },
  { name: "Houston, TX", lat: 29.76, lng: -95.37, weight: 6 },
  { name: "Chicago, IL", lat: 41.88, lng: -87.63, weight: 5 },
  { name: "Denver, CO", lat: 39.74, lng: -104.99, weight: 4 },
  { name: "Phoenix, AZ", lat: 33.45, lng: -112.07, weight: 4 },
  { name: "Seattle, WA", lat: 47.61, lng: -122.33, weight: 4 },
  { name: "Atlanta, GA", lat: 33.75, lng: -84.39, weight: 4 },
  { name: "New York, NY", lat: 40.71, lng: -74.01, weight: 6 },
  { name: "Toronto, Canada", lat: 43.65, lng: -79.38, weight: 2 },
  { name: "London, UK", lat: 51.51, lng: -0.13, weight: 2 },
  { name: "Mexico City, Mexico", lat: 19.43, lng: -99.13, weight: 1 },
  { name: "Sydney, Australia", lat: -33.87, lng: 151.21, weight: 1 },
  { name: "São Paulo, Brazil", lat: -23.55, lng: -46.63, weight: 1 },
];
const LIVE_LOCATION_WEIGHT_TOTAL = LIVE_LOCATIONS.reduce((a, l) => a + l.weight, 0);

export const LIVE_DEVICES = ["Desktop", "Mobile", "Tablet"];

export function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function pickLocation(): LiveLocation {
  let roll = Math.random() * LIVE_LOCATION_WEIGHT_TOTAL;
  for (const loc of LIVE_LOCATIONS) {
    roll -= loc.weight;
    if (roll <= 0) return loc;
  }
  return LIVE_LOCATIONS[0];
}

export function makeVisitor(secondsAgo = 0): Visitor {
  const loc = pickLocation();
  return {
    id: Math.random().toString(36).slice(2, 9),
    page: randomFrom(LIVE_PAGES),
    location: loc.name,
    lat: loc.lat,
    lng: loc.lng,
    device: randomFrom(LIVE_DEVICES),
    enteredAt: Date.now() - secondsAgo * 1000,
  };
}
