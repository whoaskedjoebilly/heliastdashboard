"use client";

// Real Supabase-backed data for the dashboard (dashboard-live-setup.md
// Phase 8). Each hook here fetches from the dashboard_* tables (RLS-scoped
// to the logged-in client via owner_user_id = auth.uid()) and shapes the
// result into the same props the tab components already render. Falls back
// to "not configured" when Supabase isn't wired up (see supabase/client.ts).
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase/client";
import type {
  CampaignRow,
  ChannelSplit,
  KeywordRow,
  SeoHealth,
  SocialPlatformStat,
  TrendPoint,
  Visitor,
} from "@/components/dashboard/types";
import type { ReportConfig } from "@/lib/reports/registry";

export interface DashboardClient {
  id: string;
  name: string;
  plan: string | null;
  created_at: string;
}

export interface IntegrationStatus {
  platform: string;
  connected: boolean;
  connected_at: string | null;
}

const ALL_PLATFORMS = ["gsc", "ga4", "gads", "meta_ads", "instagram", "tiktok", "facebook"] as const;

function formatDay(dateStr: string): string {
  // dateStr is a plain "YYYY-MM-DD" from Postgres `date` columns — parse it
  // as local time so the chart label doesn't shift a day from UTC parsing.
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Resolves the dashboard_clients row owned by the logged-in user. */
export function useDashboardClient() {
  const [client, setClient] = useState<DashboardClient | null>(null);
  const [loading, setLoading] = useState(supabase !== null);

  useEffect(() => {
    if (!supabase) {
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("dashboard_clients")
        .select("id, name, plan, created_at")
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      if (error) console.error("Failed to load dashboard client", error);
      setClient((data as DashboardClient) ?? null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { client, loading, configured: supabase !== null };
}

export type RangeKey = "today" | "yesterday" | "7d" | "30d" | "90d";

interface RangeConfig {
  /** Number of days the totals/delta window spans. */
  length: number;
  /** How many days back from today the window's END sits — 0 for windows
   * ending today, 1 for "yesterday" (which must exclude today). */
  endOffset: number;
  /** Number of days shown in trend charts. A single day has no line to
   * draw, so "today"/"yesterday" borrow a wider trailing window here for
   * context while the hero totals still reflect just that one day. */
  trendLength: number;
}

export const RANGE_CONFIG: Record<RangeKey, RangeConfig> = {
  today: { length: 1, endOffset: 0, trendLength: 14 },
  yesterday: { length: 1, endOffset: 1, trendLength: 14 },
  "7d": { length: 7, endOffset: 0, trendLength: 7 },
  "30d": { length: 30, endOffset: 0, trendLength: 30 },
  "90d": { length: 90, endOffset: 0, trendLength: 90 },
};

export interface RangeBounds {
  currentStartStr: string;
  currentEndStr: string;
  priorStartStr: string;
  priorEndStr: string;
  trendStartStr: string;
}

/** Resolves a RangeKey into concrete date-string boundaries (inclusive),
 * shared by every hook below so "today"/"yesterday"/"7d"/"30d"/"90d" mean
 * exactly the same thing on every tab. */
export function computeRangeBounds(range: RangeKey): RangeBounds {
  const { length, endOffset, trendLength } = RANGE_CONFIG[range];
  const dateStr = (d: Date) => d.toISOString().slice(0, 10);
  const addDays = (d: Date, n: number) => {
    const copy = new Date(d);
    copy.setDate(copy.getDate() + n);
    return copy;
  };
  const today = new Date();
  return {
    currentEndStr: dateStr(addDays(today, -endOffset)),
    currentStartStr: dateStr(addDays(today, -endOffset - (length - 1))),
    priorEndStr: dateStr(addDays(today, -endOffset - length)),
    priorStartStr: dateStr(addDays(today, -endOffset - 2 * length)),
    trendStartStr: dateStr(addDays(today, -endOffset - (trendLength - 1))),
  };
}

/** For a "stock" metric (e.g. follower count) where summing daily values
 * would be meaningless — picks the value as-of a given date (the latest
 * reading on or before it, since sync data can have gaps) rather than
 * summing. `rows` must be sorted ascending by date. */
function valueAsOf<T extends { date: string; value: number }>(rows: T[], targetStr: string): number | null {
  let result: number | null = null;
  for (const row of rows) {
    if (row.date > targetStr) break;
    result = row.value;
  }
  return result;
}

interface OverviewData {
  sessionsTotal: number;
  conversionsTotal: number;
  sessionsDeltaPct: number;
  conversionsDeltaPct: number;
  adSpendTotal: number;
  blendedRoas: number;
  traffic: TrendPoint[];
  conversionsTrend: TrendPoint[];
  channelSplit: ChannelSplit[];
  topKeywords: KeywordRow[];
  campaigns: CampaignRow[];
}

function pctDelta(current: number, prior: number): number {
  if (prior === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - prior) / prior) * 1000) / 10;
}

interface RawTrafficRow {
  date: string;
  sessions: number | null;
  conversions: number | null;
  channel: string | null;
}

interface RawOverview {
  trafficRows: RawTrafficRow[];
  topKeywords: KeywordRow[];
  campaigns: CampaignRow[];
}

const EMPTY_RAW: RawOverview = { trafficRows: [], topKeywords: [], campaigns: [] };

/** Aggregates daily_traffic + keyword_rankings + ad_campaigns for the Overview
 * tab. Fetches 180 days once per client (enough history for a 90-day window
 * plus its 90-day prior comparison period) and re-derives the displayed
 * totals/trend/channel split client-side whenever `range` changes, so
 * switching the 7d/30d/90d toggle doesn't require a refetch. */
export function useOverviewData(clientId: string | null, range: RangeKey = "30d") {
  const [raw, setRaw] = useState<RawOverview>(EMPTY_RAW);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!supabase || !clientId) {
      return;
    }
    let cancelled = false;

    (async () => {
      setLoading(true);
      const since180 = new Date();
      since180.setDate(since180.getDate() - 180);
      const since180Str = since180.toISOString().slice(0, 10);

      const [trafficRes, keywordsRes, campaignsRes] = await Promise.all([
        supabase
          .from("dashboard_daily_traffic")
          .select("date, sessions, conversions, channel")
          .eq("client_id", clientId)
          .gte("date", since180Str)
          .order("date", { ascending: true }),
        supabase
          .from("dashboard_keyword_rankings")
          .select("keyword, position, search_volume, checked_at")
          .eq("client_id", clientId)
          .order("checked_at", { ascending: false })
          .limit(100),
        supabase
          .from("dashboard_ad_campaigns")
          .select("name, platform, spend, roas, status, synced_at")
          .eq("client_id", clientId)
          .order("synced_at", { ascending: false })
          .limit(20),
      ]);

      if (cancelled) return;
      if (trafficRes.error) console.error("Failed to load traffic", trafficRes.error);
      if (keywordsRes.error) console.error("Failed to load keywords", keywordsRes.error);
      if (campaignsRes.error) console.error("Failed to load campaigns", campaignsRes.error);

      // Latest reading per keyword, plus the prior reading (if any) for delta.
      const keywordHistory = new Map<string, { position: number; search_volume: number }[]>();
      for (const row of keywordsRes.data ?? []) {
        const list = keywordHistory.get(row.keyword) ?? [];
        list.push({ position: row.position, search_volume: row.search_volume });
        keywordHistory.set(row.keyword, list);
      }
      const topKeywords: KeywordRow[] = Array.from(keywordHistory.entries())
        .map(([term, readings]) => {
          const [current, previous] = readings;
          return {
            term,
            pos: current.position,
            delta: previous ? previous.position - current.position : 0,
            volume: current.search_volume >= 1000 ? `${(current.search_volume / 1000).toFixed(1)}k` : String(current.search_volume),
          };
        })
        .sort((a, b) => a.pos - b.pos)
        .slice(0, 5);

      const campaigns: CampaignRow[] = (campaignsRes.data ?? []).map((c) => ({
        name: c.name,
        channel: c.platform === "google_ads" ? "Google Ads" : c.platform === "meta_ads" ? "Meta Ads" : c.platform ?? "—",
        spend: c.spend ?? 0,
        roas: c.roas ?? 0,
        status: c.status === "watch" ? "watch" : "healthy",
      }));

      setRaw({ trafficRows: trafficRes.data ?? [], topKeywords, campaigns });
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [clientId]);

  const data = useMemo<OverviewData>(() => {
    const { currentStartStr, currentEndStr, priorStartStr, priorEndStr, trendStartStr } = computeRangeBounds(range);

    const byDate = new Map<string, number>();
    const byDateConversions = new Map<string, number>();
    const byChannel = new Map<string, number>();
    let sessionsTotal = 0;
    let conversionsTotal = 0;
    let priorSessionsTotal = 0;
    let priorConversionsTotal = 0;
    for (const row of raw.trafficRows) {
      // Trend chart uses a wider window than the totals for today/yesterday
      // (see RANGE_CONFIG.trendLength) so there's an actual line to draw.
      if (row.date >= trendStartStr && row.date <= currentEndStr) {
        byDate.set(row.date, (byDate.get(row.date) ?? 0) + (row.sessions ?? 0));
        byDateConversions.set(row.date, (byDateConversions.get(row.date) ?? 0) + (row.conversions ?? 0));
      }
      if (row.date >= currentStartStr && row.date <= currentEndStr) {
        byChannel.set(row.channel ?? "Other", (byChannel.get(row.channel ?? "Other") ?? 0) + (row.sessions ?? 0));
        sessionsTotal += row.sessions ?? 0;
        conversionsTotal += row.conversions ?? 0;
      } else if (row.date >= priorStartStr && row.date <= priorEndStr) {
        priorSessionsTotal += row.sessions ?? 0;
        priorConversionsTotal += row.conversions ?? 0;
      }
    }
    const traffic: TrendPoint[] = Array.from(byDate.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([date, value]) => ({ date: formatDay(date), value }));
    const conversionsTrend: TrendPoint[] = Array.from(byDateConversions.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([date, value]) => ({ date: formatDay(date), value }));

    const channelTotal = Array.from(byChannel.values()).reduce((a, b) => a + b, 0);
    const channelSplit: ChannelSplit[] = Array.from(byChannel.entries())
      .map(([channel, value]) => ({
        channel,
        value: channelTotal > 0 ? Math.round((value / channelTotal) * 100) : 0,
      }))
      .sort((a, b) => b.value - a.value);

    const adSpendTotal = raw.campaigns.reduce((a, c) => a + c.spend, 0);
    const roasWeighted = raw.campaigns.reduce((a, c) => a + c.roas * c.spend, 0);
    const blendedRoas = adSpendTotal > 0 ? roasWeighted / adSpendTotal : 0;

    return {
      sessionsTotal,
      conversionsTotal,
      sessionsDeltaPct: pctDelta(sessionsTotal, priorSessionsTotal),
      conversionsDeltaPct: pctDelta(conversionsTotal, priorConversionsTotal),
      adSpendTotal,
      blendedRoas,
      traffic,
      conversionsTrend,
      channelSplit,
      topKeywords: raw.topKeywords,
      campaigns: raw.campaigns,
    };
  }, [raw, range]);

  return { data, loading };
}

interface SeoData {
  keywords: KeywordRow[];
  organicSessions: TrendPoint[];
  health: SeoHealth;
}

interface SeoStatic {
  keywords: KeywordRow[];
  health: SeoHealth;
}

const EMPTY_SEO_STATIC: SeoStatic = {
  keywords: [],
  health: { indexed: 0, crawlErrors: 0, avgPosition: 0, backlinks: 0 },
};

interface RawOrganicRow {
  date: string;
  sessions: number | null;
}

/** Note: indexed pages / crawl errors / backlinks have no source table yet —
 * they arrive with the Google Search Console integration (Phase 3/6/7).
 * avgPosition is computed here from tracked keywords in the meantime.
 * Keywords/health are point-in-time snapshots (unaffected by `range`);
 * organicSessions is windowed the same way Overview's traffic chart is. */
export function useSeoData(clientId: string | null, range: RangeKey = "30d") {
  const [staticData, setStaticData] = useState<SeoStatic>(EMPTY_SEO_STATIC);
  const [trafficRows, setTrafficRows] = useState<RawOrganicRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!supabase || !clientId) {
      return;
    }
    let cancelled = false;

    (async () => {
      setLoading(true);
      const since180 = new Date();
      since180.setDate(since180.getDate() - 180);
      const since180Str = since180.toISOString().slice(0, 10);

      const [keywordsRes, trafficRes] = await Promise.all([
        supabase
          .from("dashboard_keyword_rankings")
          .select("keyword, position, search_volume, checked_at")
          .eq("client_id", clientId)
          .order("checked_at", { ascending: false })
          .limit(100),
        supabase
          .from("dashboard_daily_traffic")
          .select("date, sessions, channel")
          .eq("client_id", clientId)
          .eq("channel", "organic")
          .gte("date", since180Str)
          .order("date", { ascending: true }),
      ]);

      if (cancelled) return;
      if (keywordsRes.error) console.error("Failed to load keywords", keywordsRes.error);
      if (trafficRes.error) console.error("Failed to load organic traffic", trafficRes.error);

      const keywordHistory = new Map<string, { position: number; search_volume: number }[]>();
      for (const row of keywordsRes.data ?? []) {
        const list = keywordHistory.get(row.keyword) ?? [];
        list.push({ position: row.position, search_volume: row.search_volume });
        keywordHistory.set(row.keyword, list);
      }
      const keywords: KeywordRow[] = Array.from(keywordHistory.entries())
        .map(([term, readings]) => {
          const [current, previous] = readings;
          return {
            term,
            pos: current.position,
            delta: previous ? previous.position - current.position : 0,
            volume: current.search_volume >= 1000 ? `${(current.search_volume / 1000).toFixed(1)}k` : String(current.search_volume),
          };
        })
        .sort((a, b) => a.pos - b.pos);

      const avgPosition = keywords.length > 0 ? keywords.reduce((a, k) => a + k.pos, 0) / keywords.length : 0;

      setStaticData({
        keywords,
        health: { indexed: 0, crawlErrors: 0, avgPosition: Math.round(avgPosition * 10) / 10, backlinks: 0 },
      });
      setTrafficRows(trafficRes.data ?? []);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [clientId]);

  const data = useMemo<SeoData>(() => {
    const { trendStartStr, currentEndStr } = computeRangeBounds(range);
    const byDate = new Map<string, number>();
    for (const row of trafficRows) {
      if (row.date >= trendStartStr && row.date <= currentEndStr) {
        byDate.set(row.date, (byDate.get(row.date) ?? 0) + (row.sessions ?? 0));
      }
    }
    const organicSessions: TrendPoint[] = Array.from(byDate.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([date, value]) => ({ date: formatDay(date), value }));
    return { ...staticData, organicSessions };
  }, [staticData, trafficRows, range]);

  return { data, loading };
}

interface AdsData {
  campaigns: CampaignRow[];
  conversionsTrend: TrendPoint[];
  conversionsTotal: number;
  conversionsDeltaPct: number;
}

interface RawConversionRow {
  date: string;
  conversions: number | null;
}

/** Ad spend/ROAS have no daily-granularity source table (dashboard_ad_campaigns
 * is a point-in-time sync snapshot, same limitation as Overview's ad spend) so
 * campaigns stay unwindowed; conversions come from dashboard_daily_traffic and
 * are windowed by `range` the same way Overview's are. */
export function useAdsData(clientId: string | null, range: RangeKey = "30d") {
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [trafficRows, setTrafficRows] = useState<RawConversionRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!supabase || !clientId) {
      return;
    }
    let cancelled = false;

    (async () => {
      setLoading(true);
      const since180 = new Date();
      since180.setDate(since180.getDate() - 180);
      const since180Str = since180.toISOString().slice(0, 10);

      const [campaignsRes, trafficRes] = await Promise.all([
        supabase
          .from("dashboard_ad_campaigns")
          .select("name, platform, spend, roas, status, synced_at")
          .eq("client_id", clientId)
          .order("synced_at", { ascending: false })
          .limit(20),
        supabase
          .from("dashboard_daily_traffic")
          .select("date, conversions")
          .eq("client_id", clientId)
          .gte("date", since180Str)
          .order("date", { ascending: true }),
      ]);

      if (cancelled) return;
      if (campaignsRes.error) console.error("Failed to load campaigns", campaignsRes.error);
      if (trafficRes.error) console.error("Failed to load conversions", trafficRes.error);

      setCampaigns(
        (campaignsRes.data ?? []).map((c) => ({
          name: c.name,
          channel: c.platform === "google_ads" ? "Google Ads" : c.platform === "meta_ads" ? "Meta Ads" : c.platform ?? "—",
          spend: c.spend ?? 0,
          roas: c.roas ?? 0,
          status: c.status === "watch" ? "watch" : "healthy",
        }))
      );
      setTrafficRows(trafficRes.data ?? []);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [clientId]);

  const data = useMemo<AdsData>(() => {
    const { currentStartStr, currentEndStr, priorStartStr, priorEndStr, trendStartStr } = computeRangeBounds(range);
    const byDate = new Map<string, number>();
    let conversionsTotal = 0;
    let priorConversionsTotal = 0;
    for (const row of trafficRows) {
      if (row.date >= trendStartStr && row.date <= currentEndStr) {
        byDate.set(row.date, (byDate.get(row.date) ?? 0) + (row.conversions ?? 0));
      }
      if (row.date >= currentStartStr && row.date <= currentEndStr) {
        conversionsTotal += row.conversions ?? 0;
      } else if (row.date >= priorStartStr && row.date <= priorEndStr) {
        priorConversionsTotal += row.conversions ?? 0;
      }
    }
    const conversionsTrend: TrendPoint[] = Array.from(byDate.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([date, value]) => ({ date: formatDay(date), value }));

    return { campaigns, conversionsTrend, conversionsTotal, conversionsDeltaPct: pctDelta(conversionsTotal, priorConversionsTotal) };
  }, [campaigns, trafficRows, range]);

  return { data, loading };
}

interface SocialData {
  platforms: SocialPlatformStat[];
  followersTrend: TrendPoint[];
  followersTotal: number;
  newFollowers: number;
  followersDeltaPct: number;
}

interface RawSocialRow {
  platform: string;
  followers: number | null;
  engagement_rate: number | null;
  date: string;
}

/** Followers/engagement are "stock" metrics (a level, not a daily flow) —
 * summing them across days would be meaningless. So unlike sessions/
 * conversions, `range` doesn't sum a window here: it picks the reading
 * as-of the window's end date (today for every range except "yesterday")
 * and compares it against the reading as-of the window's start, i.e.
 * "growth over the selected period" — the standard way follower counts
 * are reported. */
export function useSocialData(clientId: string | null, range: RangeKey = "30d") {
  const [rows, setRows] = useState<RawSocialRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!supabase || !clientId) {
      return;
    }
    let cancelled = false;

    (async () => {
      setLoading(true);
      const since180 = new Date();
      since180.setDate(since180.getDate() - 180);
      const since180Str = since180.toISOString().slice(0, 10);

      const { data, error } = await supabase
        .from("dashboard_social_stats")
        .select("platform, followers, engagement_rate, date")
        .eq("client_id", clientId)
        .gte("date", since180Str)
        .order("date", { ascending: true });

      if (cancelled) return;
      if (error) console.error("Failed to load social stats", error);

      setRows(data ?? []);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [clientId]);

  const data = useMemo<SocialData>(() => {
    const { currentEndStr, priorEndStr, trendStartStr } = computeRangeBounds(range);

    const rowsByPlatform = new Map<string, RawSocialRow[]>();
    const byDateTotal = new Map<string, number>();
    for (const row of rows) {
      const list = rowsByPlatform.get(row.platform) ?? [];
      list.push(row);
      rowsByPlatform.set(row.platform, list);
      if (row.date >= trendStartStr && row.date <= currentEndStr) {
        byDateTotal.set(row.date, (byDateTotal.get(row.date) ?? 0) + (row.followers ?? 0));
      }
    }

    const platforms: SocialPlatformStat[] = Array.from(rowsByPlatform.entries()).map(([platform, readings]) => {
      const followerReadings = readings.map((r) => ({ date: r.date, value: r.followers ?? 0 }));
      const engagementReadings = readings.map((r) => ({ date: r.date, value: r.engagement_rate ?? 0 }));
      const followers = valueAsOf(followerReadings, currentEndStr) ?? 0;
      const priorFollowers = valueAsOf(followerReadings, priorEndStr) ?? followers;
      const engagement = valueAsOf(engagementReadings, currentEndStr) ?? 0;
      const delta = priorFollowers > 0 ? Math.round(((followers - priorFollowers) / priorFollowers) * 1000) / 10 : 0;
      const growth = followers - priorFollowers;
      return { platform, followers, growth, delta, engagement };
    });

    const followersTrend: TrendPoint[] = Array.from(byDateTotal.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([date, value]) => ({ date: formatDay(date), value }));

    const followersTotal = platforms.reduce((a, p) => a + p.followers, 0);
    // Sum each platform's prior-window value directly rather than deriving
    // it from `delta`, so rounding in the per-platform % doesn't compound.
    const priorFollowersTotal = Array.from(rowsByPlatform.values()).reduce((a, readings) => {
      const followerReadings = readings.map((r) => ({ date: r.date, value: r.followers ?? 0 }));
      return a + (valueAsOf(followerReadings, priorEndStr) ?? 0);
    }, 0);
    const newFollowers = followersTotal - priorFollowersTotal;
    const followersDeltaPct = pctDelta(followersTotal, priorFollowersTotal);

    return { platforms, followersTrend, followersTotal, newFollowers, followersDeltaPct };
  }, [rows, range]);

  return { data, loading };
}

/** Live visitor feed for the Live tab (Phase 9) — initial fetch plus a
 * Realtime subscription on inserts/deletes/updates scoped to this client. */
export function useLiveVisitors(clientId: string | null) {
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!supabase || !clientId) {
      return;
    }
    let cancelled = false;

    const rowToVisitor = (row: Record<string, unknown>): Visitor => ({
      id: String(row.id),
      page: String(row.page ?? ""),
      location: String(row.location ?? ""),
      lat: Number(row.lat ?? 0),
      lng: Number(row.lng ?? 0),
      device: String(row.device ?? ""),
      enteredAt: new Date(String(row.entered_at)).getTime(),
    });

    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("dashboard_live_visitors")
        .select("id, page, location, lat, lng, device, entered_at")
        .eq("client_id", clientId)
        .order("entered_at", { ascending: true });
      if (cancelled) return;
      if (error) console.error("Failed to load live visitors", error);
      setVisitors((data ?? []).map(rowToVisitor));
      setLoading(false);
    })();

    const channel = supabase
      .channel(`live_visitors:${clientId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "dashboard_live_visitors", filter: `client_id=eq.${clientId}` },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setVisitors((prev) => [...prev, rowToVisitor(payload.new as Record<string, unknown>)]);
          } else if (payload.eventType === "DELETE") {
            setVisitors((prev) => prev.filter((v) => v.id !== String((payload.old as Record<string, unknown>).id)));
          } else if (payload.eventType === "UPDATE") {
            const updated = rowToVisitor(payload.new as Record<string, unknown>);
            setVisitors((prev) => prev.map((v) => (v.id === updated.id ? updated : v)));
          }
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase?.removeChannel(channel);
    };
  }, [clientId]);

  return { visitors, loading };
}

/** Connection status per platform, via /api/me/integrations — that route
 * verifies the caller's own session server-side and only returns platform
 * names + connected_at, never the tokens (dashboard_client_integrations has
 * no client-facing RLS read policy by design). */
export function useIntegrationStatus(clientId: string | null) {
  const [statuses, setStatuses] = useState<IntegrationStatus[]>(integrationSummary([]));
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!supabase || !clientId) {
      return;
    }
    let cancelled = false;

    supabase.auth.getSession().then(async ({ data }) => {
      setLoading(true);
      const token = data.session?.access_token;
      if (!token) {
        if (!cancelled) {
          setStatuses(integrationSummary([]));
          setLoading(false);
        }
        return;
      }
      try {
        const res = await fetch("/api/me/integrations", { headers: { Authorization: `Bearer ${token}` } });
        const json = (await res.json()) as { connected?: { platform: string; connected_at: string }[] };
        if (cancelled) return;
        const platforms = (json.connected ?? []).map((c) => c.platform);
        setStatuses(integrationSummary(platforms));
      } catch (err) {
        console.error("Failed to load integration status", err);
        if (!cancelled) setStatuses(integrationSummary([]));
      } finally {
        if (!cancelled) setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [clientId]);

  return { statuses, loading };
}

function integrationSummary(connected: string[]): IntegrationStatus[] {
  return ALL_PLATFORMS.map((platform) => ({
    platform,
    connected: connected.includes(platform),
    connected_at: null,
  }));
}

export interface SavedReport {
  id: string;
  title: string;
  prompt: string;
  content: string;
  created_at: string;
}

/** Saved custom reports (RLS-scoped to the caller's own client_id, so this
 * hits Supabase directly from the browser — no server route needed for
 * plain CRUD, only for the Claude generation call itself). */
export function useSavedReports(clientId: string | null) {
  const [reports, setReports] = useState<SavedReport[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!supabase || !clientId) {
      setReports([]);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("dashboard_reports")
      .select("id, title, prompt, content, created_at")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });
    if (error) console.error("Failed to load saved reports", error);
    setReports((data as SavedReport[]) ?? []);
    setLoading(false);
  }, [clientId]);

  useEffect(() => {
    (async () => {
      await refresh();
    })();
  }, [refresh]);

  const saveReport = useCallback(
    async (title: string, prompt: string, content: string) => {
      if (!supabase || !clientId) return { error: "Not signed in" };
      const { error } = await supabase.from("dashboard_reports").insert({ client_id: clientId, title, prompt, content });
      if (error) return { error: error.message };
      await refresh();
      return { error: null };
    },
    [clientId, refresh]
  );

  const deleteReport = useCallback(
    async (id: string) => {
      if (!supabase) return;
      const { error } = await supabase.from("dashboard_reports").delete().eq("id", id);
      if (error) console.error("Failed to delete report", error);
      await refresh();
    },
    [refresh]
  );

  return { reports, loading, saveReport, deleteReport };
}

export interface CustomReport {
  id: string;
  title: string;
  config: ReportConfig;
  created_at: string;
}

/** CRUD for saved custom-report *definitions* (dashboard_custom_reports) —
 * distinct from useSavedReports above, which stores frozen AI-answer text.
 * A custom report re-runs its query every time it's opened; only the
 * definition (dataset/metrics/dimension/filters/chart type) is persisted. */
export function useCustomReports(clientId: string | null) {
  const [reports, setReports] = useState<CustomReport[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!supabase || !clientId) {
      setReports([]);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("dashboard_custom_reports")
      .select("id, title, config, created_at")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });
    if (error) console.error("Failed to load custom reports", error);
    setReports((data as CustomReport[]) ?? []);
    setLoading(false);
  }, [clientId]);

  useEffect(() => {
    (async () => {
      await refresh();
    })();
  }, [refresh]);

  const saveCustomReport = useCallback(
    async (title: string, config: ReportConfig) => {
      if (!supabase || !clientId) return { error: "Not signed in" };
      const { error } = await supabase.from("dashboard_custom_reports").insert({ client_id: clientId, title, config });
      if (error) return { error: error.message };
      await refresh();
      return { error: null };
    },
    [clientId, refresh]
  );

  const deleteCustomReport = useCallback(
    async (id: string) => {
      if (!supabase) return;
      const { error } = await supabase.from("dashboard_custom_reports").delete().eq("id", id);
      if (error) console.error("Failed to delete custom report", error);
      await refresh();
    },
    [refresh]
  );

  return { reports, loading, saveCustomReport, deleteCustomReport };
}
