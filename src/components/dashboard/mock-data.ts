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

export function genTrend(days: number, base: number, drift: number, noise: number): TrendPoint[] {
  const out: TrendPoint[] = [];
  let v = base;
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    v = Math.max(0, v + drift + (Math.random() - 0.5) * noise);
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    out.push({
      date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      value: Math.round(v),
    });
  }
  return out;
}

export const TRAFFIC: TrendPoint[] = genTrend(30, 420, 4.5, 60);
export const CONVERSIONS: TrendPoint[] = genTrend(30, 14, 0.15, 5);

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

export const FOLLOWERS_TREND: TrendPoint[] = genTrend(30, 3200, 12, 20);

export const SOCIAL_PLATFORMS: SocialPlatformStat[] = [
  { platform: "Instagram", followers: 4820, delta: 6.2, engagement: 3.8 },
  { platform: "TikTok", followers: 2150, delta: 14.1, engagement: 6.4 },
  { platform: "Facebook", followers: 1990, delta: 1.4, engagement: 1.9 },
];

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
