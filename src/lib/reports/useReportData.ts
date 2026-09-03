"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { computeRangeBounds, RANGE_CONFIG, type RangeKey } from "@/lib/dashboard-data";
import {
  aggregateCampaigns,
  aggregatePages,
  aggregateSocial,
  aggregateTraffic,
  type CampaignRawRow,
  type PageRawRow,
  type ReportConfig,
  type ReportRow,
  type SocialRawRow,
  type TrafficRawRow,
} from "./registry";
import { demoCampaignRows, demoPageRows, demoSocialRows, demoTrafficRows } from "./demo-data";

interface RawByDataset {
  traffic: TrafficRawRow[];
  campaigns: CampaignRawRow[];
  social: SocialRawRow[];
  pages: PageRawRow[];
}
const EMPTY_RAW: RawByDataset = { traffic: [], campaigns: [], social: [], pages: [] };

/** Runs a ReportConfig against either the demo dataset or a real account's
 * Supabase tables and returns the aggregated rows — a report is a live
 * query, not a stored result, so this re-runs whenever the config or range
 * changes. Both paths funnel through the same aggregate*() functions
 * (registry.ts) so their behavior can't drift apart. The demo path is pure
 * synchronous computation (useMemo, no effect needed); only the real
 * Supabase fetch needs an effect. */
export function useReportData(configured: boolean, clientId: string | null, config: ReportConfig, range: RangeKey) {
  const days = RANGE_CONFIG[range].length;

  const demoRaw = useMemo<RawByDataset>(() => {
    if (configured) return EMPTY_RAW;
    return {
      traffic: demoTrafficRows(days),
      campaigns: demoCampaignRows(),
      social: demoSocialRows(days),
      pages: demoPageRows(days),
    };
  }, [configured, days]);

  const [realRaw, setRealRaw] = useState<RawByDataset>(EMPTY_RAW);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!configured || !supabase || !clientId) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      const { currentStartStr, currentEndStr } = computeRangeBounds(range);

      try {
        switch (config.dataset) {
          case "traffic": {
            const { data, error: err } = await supabase
              .from("dashboard_daily_traffic")
              .select("date, channel, sessions, conversions")
              .eq("client_id", clientId)
              .gte("date", currentStartStr)
              .lte("date", currentEndStr);
            if (err) throw err;
            if (!cancelled) {
              setRealRaw((prev) => ({
                ...prev,
                traffic: (data ?? []).map((r) => ({ date: r.date, channel: r.channel ?? "Other", sessions: r.sessions ?? 0, conversions: r.conversions ?? 0 })),
              }));
            }
            break;
          }
          case "campaigns": {
            const { data, error: err } = await supabase
              .from("dashboard_ad_campaigns")
              .select("name, platform, spend, roas, status")
              .eq("client_id", clientId);
            if (err) throw err;
            if (!cancelled) {
              setRealRaw((prev) => ({
                ...prev,
                campaigns: (data ?? []).map((r) => ({ name: r.name, platform: r.platform ?? "Other", status: r.status ?? "healthy", spend: r.spend ?? 0, roas: r.roas ?? 0 })),
              }));
            }
            break;
          }
          case "social": {
            const { data, error: err } = await supabase
              .from("dashboard_social_stats")
              .select("date, platform, followers, engagement_rate")
              .eq("client_id", clientId)
              .gte("date", currentStartStr)
              .lte("date", currentEndStr);
            if (err) throw err;
            if (!cancelled) {
              setRealRaw((prev) => ({
                ...prev,
                social: (data ?? []).map((r) => ({ date: r.date, platform: r.platform ?? "Other", followers: r.followers ?? 0, engagement_rate: r.engagement_rate ?? 0 })),
              }));
            }
            break;
          }
          case "pages": {
            const { data, error: err } = await supabase
              .from("dashboard_ga4_pages")
              .select("date, page_path, sessions, page_views, bounce_rate, avg_engagement_sec")
              .eq("client_id", clientId)
              .gte("date", currentStartStr)
              .lte("date", currentEndStr);
            if (err) throw err;
            if (!cancelled) {
              setRealRaw((prev) => ({
                ...prev,
                pages: (data ?? []).map((r) => ({
                  date: r.date,
                  page_path: r.page_path,
                  sessions: r.sessions ?? 0,
                  page_views: r.page_views ?? 0,
                  bounce_rate: r.bounce_rate ?? 0,
                  avg_engagement_sec: r.avg_engagement_sec ?? 0,
                })),
              }));
            }
            break;
          }
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load report data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // config.dataset (not the whole config) is the only piece that should
    // trigger a refetch — metrics/dimension/filters/sort only affect the
    // client-side aggregation below, not which raw rows to fetch.
  }, [configured, clientId, config.dataset, range]);

  const raw = configured ? realRaw : demoRaw;

  const rows = useMemo<ReportRow[]>(() => {
    switch (config.dataset) {
      case "traffic":
        return aggregateTraffic(raw.traffic, config);
      case "campaigns":
        return aggregateCampaigns(raw.campaigns, config);
      case "social":
        return aggregateSocial(raw.social, config);
      case "pages":
        return aggregatePages(raw.pages, config);
    }
  }, [config, raw]);

  return { rows, loading, error };
}
