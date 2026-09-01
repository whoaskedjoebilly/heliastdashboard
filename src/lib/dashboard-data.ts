"use client";

// Real Supabase-backed data for the dashboard (dashboard-live-setup.md
// Phase 8). Each hook here fetches from the dashboard_* tables (RLS-scoped
// to the logged-in client via owner_user_id = auth.uid()) and shapes the
// result into the same props the tab components already render. Falls back
// to "not configured" when Supabase isn't wired up (see supabase/client.ts).
import { useEffect, useState } from "react";
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

const ALL_PLATFORMS = ["gsc", "gads", "meta_ads", "instagram", "tiktok", "facebook"] as const;

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

interface OverviewData {
  sessions30d: number;
  conversions30d: number;
  sessionsDeltaPct: number;
  conversionsDeltaPct: number;
  adSpend30d: number;
  blendedRoas: number;
  traffic: TrendPoint[];
  channelSplit: ChannelSplit[];
  topKeywords: KeywordRow[];
  campaigns: CampaignRow[];
}

const EMPTY_OVERVIEW: OverviewData = {
  sessions30d: 0,
  conversions30d: 0,
  sessionsDeltaPct: 0,
  conversionsDeltaPct: 0,
  adSpend30d: 0,
  blendedRoas: 0,
  traffic: [],
  channelSplit: [],
  topKeywords: [],
  campaigns: [],
};

function pctDelta(current: number, prior: number): number {
  if (prior === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - prior) / prior) * 1000) / 10;
}

/** Aggregates daily_traffic + keyword_rankings + ad_campaigns for the Overview tab. */
export function useOverviewData(clientId: string | null) {
  const [data, setData] = useState<OverviewData>(EMPTY_OVERVIEW);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!supabase || !clientId) {
      return;
    }
    let cancelled = false;

    (async () => {
      setLoading(true);
      const since60 = new Date();
      since60.setDate(since60.getDate() - 60);
      const since60Str = since60.toISOString().slice(0, 10);
      const since30 = new Date();
      since30.setDate(since30.getDate() - 30);
      const since30Str = since30.toISOString().slice(0, 10);

      const [trafficRes, keywordsRes, campaignsRes] = await Promise.all([
        supabase
          .from("dashboard_daily_traffic")
          .select("date, sessions, conversions, channel")
          .eq("client_id", clientId)
          .gte("date", since60Str)
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

      const trafficRows = trafficRes.data ?? [];
      const byDate = new Map<string, number>();
      const byChannel = new Map<string, number>();
      let sessions30d = 0;
      let conversions30d = 0;
      let priorSessions30d = 0;
      let priorConversions30d = 0;
      for (const row of trafficRows) {
        const inLast30 = row.date >= since30Str;
        if (inLast30) {
          byDate.set(row.date, (byDate.get(row.date) ?? 0) + (row.sessions ?? 0));
          byChannel.set(row.channel ?? "Other", (byChannel.get(row.channel ?? "Other") ?? 0) + (row.sessions ?? 0));
          sessions30d += row.sessions ?? 0;
          conversions30d += row.conversions ?? 0;
        } else {
          priorSessions30d += row.sessions ?? 0;
          priorConversions30d += row.conversions ?? 0;
        }
      }
      const traffic: TrendPoint[] = Array.from(byDate.entries())
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([date, value]) => ({ date: formatDay(date), value }));

      const channelTotal = Array.from(byChannel.values()).reduce((a, b) => a + b, 0);
      const channelSplit: ChannelSplit[] = Array.from(byChannel.entries())
        .map(([channel, value]) => ({
          channel,
          value: channelTotal > 0 ? Math.round((value / channelTotal) * 100) : 0,
        }))
        .sort((a, b) => b.value - a.value);

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

      const adSpend30d = campaigns.reduce((a, c) => a + c.spend, 0);
      const roasWeighted = campaigns.reduce((a, c) => a + c.roas * c.spend, 0);
      const blendedRoas = adSpend30d > 0 ? roasWeighted / adSpend30d : 0;

      setData({
        sessions30d,
        conversions30d,
        sessionsDeltaPct: pctDelta(sessions30d, priorSessions30d),
        conversionsDeltaPct: pctDelta(conversions30d, priorConversions30d),
        adSpend30d,
        blendedRoas,
        traffic,
        channelSplit,
        topKeywords,
        campaigns,
      });
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [clientId]);

  return { data, loading };
}

interface SeoData {
  keywords: KeywordRow[];
  organicSessions: TrendPoint[];
  health: SeoHealth;
}

const EMPTY_SEO: SeoData = {
  keywords: [],
  organicSessions: [],
  health: { indexed: 0, crawlErrors: 0, avgPosition: 0, backlinks: 0 },
};

/** Note: indexed pages / crawl errors / backlinks have no source table yet —
 * they arrive with the Google Search Console integration (Phase 3/6/7).
 * avgPosition is computed here from tracked keywords in the meantime. */
export function useSeoData(clientId: string | null) {
  const [data, setData] = useState<SeoData>(EMPTY_SEO);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!supabase || !clientId) {
      return;
    }
    let cancelled = false;

    (async () => {
      setLoading(true);
      const since = new Date();
      since.setDate(since.getDate() - 14);
      const sinceStr = since.toISOString().slice(0, 10);

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
          .gte("date", sinceStr)
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

      const avgPosition =
        keywords.length > 0 ? keywords.reduce((a, k) => a + k.pos, 0) / keywords.length : 0;

      const organicSessions: TrendPoint[] = (trafficRes.data ?? []).map((row) => ({
        date: formatDay(row.date),
        value: row.sessions ?? 0,
      }));

      setData({
        keywords,
        organicSessions,
        health: { indexed: 0, crawlErrors: 0, avgPosition: Math.round(avgPosition * 10) / 10, backlinks: 0 },
      });
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [clientId]);

  return { data, loading };
}

interface AdsData {
  campaigns: CampaignRow[];
  conversionsTrend: TrendPoint[];
  conversions30d: number;
}

const EMPTY_ADS: AdsData = { campaigns: [], conversionsTrend: [], conversions30d: 0 };

export function useAdsData(clientId: string | null) {
  const [data, setData] = useState<AdsData>(EMPTY_ADS);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!supabase || !clientId) {
      return;
    }
    let cancelled = false;

    (async () => {
      setLoading(true);
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const sinceStr = since.toISOString().slice(0, 10);

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
          .gte("date", sinceStr)
          .order("date", { ascending: true }),
      ]);

      if (cancelled) return;
      if (campaignsRes.error) console.error("Failed to load campaigns", campaignsRes.error);
      if (trafficRes.error) console.error("Failed to load conversions", trafficRes.error);

      const campaigns: CampaignRow[] = (campaignsRes.data ?? []).map((c) => ({
        name: c.name,
        channel: c.platform === "google_ads" ? "Google Ads" : c.platform === "meta_ads" ? "Meta Ads" : c.platform ?? "—",
        spend: c.spend ?? 0,
        roas: c.roas ?? 0,
        status: c.status === "watch" ? "watch" : "healthy",
      }));

      const byDate = new Map<string, number>();
      let conversions30d = 0;
      for (const row of trafficRes.data ?? []) {
        byDate.set(row.date, (byDate.get(row.date) ?? 0) + (row.conversions ?? 0));
        conversions30d += row.conversions ?? 0;
      }
      const conversionsTrend: TrendPoint[] = Array.from(byDate.entries())
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([date, value]) => ({ date: formatDay(date), value }));

      setData({ campaigns, conversionsTrend, conversions30d });
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [clientId]);

  return { data, loading };
}

interface SocialData {
  platforms: SocialPlatformStat[];
  followersTrend: TrendPoint[];
}

const EMPTY_SOCIAL: SocialData = { platforms: [], followersTrend: [] };

export function useSocialData(clientId: string | null) {
  const [data, setData] = useState<SocialData>(EMPTY_SOCIAL);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!supabase || !clientId) {
      return;
    }
    let cancelled = false;

    (async () => {
      setLoading(true);
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const sinceStr = since.toISOString().slice(0, 10);

      const { data: rows, error } = await supabase
        .from("dashboard_social_stats")
        .select("platform, followers, engagement_rate, date")
        .eq("client_id", clientId)
        .gte("date", sinceStr)
        .order("date", { ascending: true });

      if (cancelled) return;
      if (error) console.error("Failed to load social stats", error);

      const rowsByPlatform = new Map<string, { followers: number; engagement_rate: number; date: string }[]>();
      const byDateTotal = new Map<string, number>();
      for (const row of rows ?? []) {
        const list = rowsByPlatform.get(row.platform) ?? [];
        list.push(row);
        rowsByPlatform.set(row.platform, list);
        byDateTotal.set(row.date, (byDateTotal.get(row.date) ?? 0) + (row.followers ?? 0));
      }

      const platforms: SocialPlatformStat[] = Array.from(rowsByPlatform.entries()).map(([platform, readings]) => {
        const latest = readings[readings.length - 1];
        const prior = readings.length > 1 ? readings[readings.length - 2] : null;
        const delta = prior && prior.followers > 0 ? Math.round(((latest.followers - prior.followers) / prior.followers) * 1000) / 10 : 0;
        return { platform, followers: latest.followers ?? 0, delta, engagement: latest.engagement_rate ?? 0 };
      });

      const followersTrend: TrendPoint[] = Array.from(byDateTotal.entries())
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([date, value]) => ({ date: formatDay(date), value }));

      setData({ platforms, followersTrend });
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [clientId]);

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
