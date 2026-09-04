"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import {
  aggregateCampaigns,
  aggregatePages,
  aggregatePagesSplit,
  aggregateSocial,
  aggregateTraffic,
  aggregateTrafficSplit,
  SPLITTABLE_DIMENSIONS,
  type CampaignRawRow,
  type PageRawRow,
  type ReportConfig,
  type ReportRow,
  type SocialRawRow,
  type TrafficRawRow,
} from "./registry";
import { DEFAULT_REPORT_RANGE, type ReportRange } from "./date-range";
import { demoCampaignRows, demoPageRows, demoSocialRows, demoTrafficRows } from "./demo-data";

interface RawByDataset {
  traffic: TrafficRawRow[];
  campaigns: CampaignRawRow[];
  social: SocialRawRow[];
  pages: PageRawRow[];
}
const EMPTY_RAW: RawByDataset = { traffic: [], campaigns: [], social: [], pages: [] };

/** True when config.splitBy is set, applies to this dataset, and the rest
 * of the config is in a state where a split actually makes sense (grouped
 * by date, exactly one metric selected). */
function isSplitActive(config: ReportConfig): boolean {
  return (
    !!config.splitBy &&
    config.dimension === "date" &&
    config.metrics.length === 1 &&
    (SPLITTABLE_DIMENSIONS[config.dataset] ?? []).includes(config.splitBy)
  );
}

/** Runs a ReportConfig against either the demo dataset or a real account's
 * Supabase tables and returns the aggregated rows — a report is a live
 * query, not a stored result, so this re-runs whenever the config or its
 * date range changes. Both paths funnel through the same aggregate*()
 * functions (registry.ts) so their behavior can't drift apart. The demo
 * path is pure synchronous computation (useMemo, no effect needed); only
 * the real Supabase fetch needs an effect. */
export function useReportData(configured: boolean, clientId: string | null, config: ReportConfig) {
  const range: ReportRange = config.range ?? DEFAULT_REPORT_RANGE;
  const { startStr, endStr } = range;

  const demoRaw = useMemo<RawByDataset>(() => {
    if (configured) return EMPTY_RAW;
    return {
      traffic: demoTrafficRows(startStr, endStr),
      campaigns: demoCampaignRows(),
      social: demoSocialRows(startStr, endStr),
      pages: demoPageRows(startStr, endStr),
    };
  }, [configured, startStr, endStr]);

  const [realRaw, setRealRaw] = useState<RawByDataset>(EMPTY_RAW);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!configured || !supabase || !clientId) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);

      try {
        switch (config.dataset) {
          case "traffic": {
            const { data, error: err } = await supabase
              .from("dashboard_daily_traffic")
              .select("date, channel, sessions, conversions")
              .eq("client_id", clientId)
              .gte("date", startStr)
              .lte("date", endStr);
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
              .gte("date", startStr)
              .lte("date", endStr);
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
              .select("date, page_path, sessions, page_views, bounce_rate, avg_engagement_sec, engaged_sessions")
              .eq("client_id", clientId)
              .gte("date", startStr)
              .lte("date", endStr);
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
                  engaged_sessions: r.engaged_sessions ?? 0,
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
  }, [configured, clientId, config.dataset, startStr, endStr]);

  const raw = configured ? realRaw : demoRaw;
  const split = isSplitActive(config);

  const { rows, seriesKeys } = useMemo<{ rows: ReportRow[]; seriesKeys: string[] | null }>(() => {
    if (split) {
      if (config.dataset === "traffic") {
        const r = aggregateTrafficSplit(raw.traffic, config);
        return { rows: r.rows, seriesKeys: r.seriesKeys };
      }
      if (config.dataset === "pages") {
        const r = aggregatePagesSplit(raw.pages, config);
        return { rows: r.rows, seriesKeys: r.seriesKeys };
      }
    }
    switch (config.dataset) {
      case "traffic":
        return { rows: aggregateTraffic(raw.traffic, config), seriesKeys: null };
      case "campaigns":
        return { rows: aggregateCampaigns(raw.campaigns, config), seriesKeys: null };
      case "social":
        return { rows: aggregateSocial(raw.social, config), seriesKeys: null };
      case "pages":
        return { rows: aggregatePages(raw.pages, config), seriesKeys: null };
    }
  }, [config, raw, split]);

  return { rows, loading, error, seriesKeys };
}
