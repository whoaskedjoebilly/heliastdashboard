// Metadata + aggregation engine for the Analytics page's custom report
// builder. A report is a *definition* (dataset + metrics + dimension +
// range + chart type + filters), not a frozen snapshot — re-running it
// always reflects current data. The same aggregate() function runs against
// both the demo dataset (synthetic rows) and a real account's Supabase
// rows, so the two paths can never drift in behavior.

import { DEFAULT_REPORT_RANGE, type ReportRange } from "./date-range";
import { humanizePagePath } from "@/lib/page-labels";

export type Dataset = "traffic" | "campaigns" | "social" | "pages";
export type ChartType = "line" | "bar" | "table" | "donut";
export type MetricFormat = "number" | "currency" | "percent" | "seconds" | "ratio";

export interface MetricDef {
  key: string;
  label: string;
  format: MetricFormat;
}

export interface DimensionDef {
  key: string;
  label: string;
}

export interface DatasetDef {
  key: Dataset;
  label: string;
  description: string;
  metrics: MetricDef[];
  dimensions: DimensionDef[];
}

export const DATASETS: Record<Dataset, DatasetDef> = {
  traffic: {
    key: "traffic",
    label: "Traffic & Conversions",
    description: "Sessions and conversions from dashboard_daily_traffic.",
    metrics: [
      { key: "sessions", label: "Sessions", format: "number" },
      { key: "conversions", label: "Conversions", format: "number" },
      { key: "conversion_rate", label: "Conversion rate", format: "percent" },
    ],
    dimensions: [
      { key: "date", label: "Date" },
      { key: "channel", label: "Channel" },
    ],
  },
  campaigns: {
    key: "campaigns",
    label: "Ad Campaigns",
    description: "Spend and ROAS from dashboard_ad_campaigns.",
    metrics: [
      { key: "spend", label: "Spend", format: "currency" },
      { key: "roas", label: "ROAS", format: "ratio" },
      { key: "spend_share", label: "Share of total spend", format: "percent" },
    ],
    dimensions: [
      { key: "name", label: "Campaign" },
      { key: "platform", label: "Platform" },
      { key: "status", label: "Status" },
    ],
  },
  social: {
    key: "social",
    label: "Social",
    description: "Follower counts and engagement from dashboard_social_stats.",
    metrics: [
      { key: "followers", label: "Followers", format: "number" },
      { key: "engagement_rate", label: "Engagement rate", format: "percent" },
    ],
    dimensions: [
      { key: "platform", label: "Platform" },
      { key: "date", label: "Date" },
    ],
  },
  pages: {
    key: "pages",
    label: "Page Performance (GA4)",
    description: "Per-page sessions, bounce rate, and engagement from dashboard_ga4_pages.",
    metrics: [
      { key: "sessions", label: "Sessions", format: "number" },
      { key: "page_views", label: "Page views", format: "number" },
      { key: "bounce_rate", label: "Bounce rate", format: "percent" },
      { key: "engagement_rate", label: "Engagement rate", format: "percent" },
      { key: "avg_engagement_sec", label: "Avg. engagement", format: "seconds" },
      { key: "pages_per_session", label: "Pages / session", format: "ratio" },
    ],
    dimensions: [
      { key: "page_path", label: "Page" },
      { key: "date", label: "Date" },
    ],
  },
};

/** Datasets/dimensions that can be split into multiple series on a
 * date-grouped chart (e.g. "Sessions by date, split by channel" — one line
 * per channel instead of one aggregate line). Only a dataset with both a
 * "date" dimension and at least one other categorical dimension qualifies —
 * campaigns has no date history (a snapshot dataset), so it's excluded. */
export const SPLITTABLE_DIMENSIONS: Partial<Record<Dataset, string[]>> = {
  traffic: ["channel"],
  pages: ["page_path"],
};

export interface FilterRule {
  field: string;
  op: "eq" | "gt" | "gte" | "lt" | "lte";
  value: string;
}

export interface ReportConfig {
  dataset: Dataset;
  metrics: string[];
  dimension: string;
  chartType: ChartType;
  filters: FilterRule[];
  sortMetric: string;
  sortDir: "desc" | "asc";
  limit: number;
  /** Optional so older saved reports (from before the date-range picker
   * existed) still load — callers should fall back to DEFAULT_REPORT_RANGE. */
  range?: ReportRange;
  /** A second dimension to break a date-grouped report into multiple
   * series (e.g. Group by: Date, Split by: Channel). Only meaningful with
   * dimension === "date", a single selected metric, and a dataset listed
   * in SPLITTABLE_DIMENSIONS — null/undefined otherwise. */
  splitBy?: string | null;
}

export interface ReportRow {
  label: string;
  [metricKey: string]: string | number;
}

export function defaultConfig(dataset: Dataset, range: ReportRange = DEFAULT_REPORT_RANGE): ReportConfig {
  const def = DATASETS[dataset];
  return {
    dataset,
    metrics: [def.metrics[0].key],
    dimension: def.dimensions[0].key,
    chartType: def.dimensions[0].key === "date" ? "line" : "bar",
    filters: [],
    sortMetric: def.metrics[0].key,
    sortDir: "desc",
    limit: 15,
    range,
  };
}

export function formatMetricValue(value: number, format: MetricFormat): string {
  switch (format) {
    case "currency":
      return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    case "percent":
      return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
    case "seconds":
      return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}s`;
    case "ratio":
      return `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}x`;
    default:
      return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
  }
}

// ---------------------------------------------------------------------------
// Raw row shapes — one per dataset, produced identically by the demo and
// real-account data sources so aggregate() below never needs to know which
// one it's looking at.
// ---------------------------------------------------------------------------

export interface TrafficRawRow {
  date: string;
  channel: string;
  sessions: number;
  conversions: number;
}

export interface CampaignRawRow {
  name: string;
  platform: string;
  status: string;
  spend: number;
  roas: number;
}

export interface SocialRawRow {
  date: string;
  platform: string;
  followers: number;
  engagement_rate: number;
}

export interface PageRawRow {
  date: string;
  page_path: string;
  sessions: number;
  page_views: number;
  bounce_rate: number;
  avg_engagement_sec: number;
  engaged_sessions: number;
}

function applyFilters<T extends object>(rows: T[], filters: FilterRule[]): T[] {
  return rows.filter((row) =>
    filters.every((f) => {
      const raw = (row as Record<string, unknown>)[f.field];
      if (raw === undefined) return true;
      if (typeof raw === "number") {
        const target = Number(f.value);
        if (Number.isNaN(target)) return true;
        switch (f.op) {
          case "eq":
            return raw === target;
          case "gt":
            return raw > target;
          case "gte":
            return raw >= target;
          case "lt":
            return raw < target;
          case "lte":
            return raw <= target;
        }
      }
      const rawStr = String(raw).toLowerCase();
      const targetStr = f.value.toLowerCase();
      return f.op === "eq" ? rawStr === targetStr : rawStr.includes(targetStr);
    })
  );
}

function sortAndLimit(rows: ReportRow[], config: ReportConfig): ReportRow[] {
  // A report grouped by date is a time series — always show it chronological
  // and in full. Sorting it by a metric's value (the default for every other
  // dimension) would turn a trend line into a scrambled zigzag, and the row
  // limit would arbitrarily cut days out of the middle of the window.
  if (config.dimension === "date") {
    return [...rows].sort((a, b) => String(a.label).localeCompare(String(b.label)));
  }
  const sorted = [...rows].sort((a, b) => {
    const av = Number(a[config.sortMetric] ?? 0);
    const bv = Number(b[config.sortMetric] ?? 0);
    return config.sortDir === "desc" ? bv - av : av - bv;
  });
  return sorted.slice(0, config.limit);
}

/** Groups raw rows by the config's dimension and computes every selected
 * (plus any metric a derived value depends on) metric per group. Each
 * dataset aggregates a little differently — sessions/conversions/spend are
 * flow metrics (sum), ROAS/engagement/bounce are ratios (simple average),
 * followers is a stock metric (latest reading in the group, not a sum). */
export function aggregateTraffic(rows: TrafficRawRow[], config: ReportConfig): ReportRow[] {
  const filtered = applyFilters(rows, config.filters);
  const groups = new Map<string, { sessions: number; conversions: number }>();
  for (const row of filtered) {
    const key = config.dimension === "date" ? row.date : row.channel;
    const g = groups.get(key) ?? { sessions: 0, conversions: 0 };
    g.sessions += row.sessions;
    g.conversions += row.conversions;
    groups.set(key, g);
  }
  const out: ReportRow[] = Array.from(groups.entries()).map(([label, g]) => {
    const rate = g.sessions > 0 ? (g.conversions / g.sessions) * 100 : 0;
    return { label, sessions: g.sessions, conversions: g.conversions, conversion_rate: Math.round(rate * 10) / 10 };
  });
  return sortAndLimit(out, config);
}

export function aggregateCampaigns(rows: CampaignRawRow[], config: ReportConfig): ReportRow[] {
  const filtered = applyFilters(rows, config.filters);
  const totalSpend = filtered.reduce((a, r) => a + r.spend, 0);
  const groups = new Map<string, { spend: number; roasWeighted: number }>();
  for (const row of filtered) {
    const key = config.dimension === "name" ? row.name : config.dimension === "platform" ? row.platform : row.status;
    const g = groups.get(key) ?? { spend: 0, roasWeighted: 0 };
    g.spend += row.spend;
    g.roasWeighted += row.roas * row.spend;
    groups.set(key, g);
  }
  const out: ReportRow[] = Array.from(groups.entries()).map(([label, g]) => ({
    label,
    spend: Math.round(g.spend),
    roas: g.spend > 0 ? Math.round((g.roasWeighted / g.spend) * 100) / 100 : 0,
    spend_share: totalSpend > 0 ? Math.round((g.spend / totalSpend) * 1000) / 10 : 0,
  }));
  return sortAndLimit(out, config);
}

export function aggregateSocial(rows: SocialRawRow[], config: ReportConfig): ReportRow[] {
  const filtered = applyFilters(rows, config.filters);

  if (config.dimension === "date") {
    // Followers is a stock metric per platform, but a total-across-platforms
    // trend line is still meaningful (it's how the Overview/Social tabs
    // already report "total followers") — sum platforms per day, average
    // their engagement rates.
    const groups = new Map<string, { followers: number; engagementSum: number; count: number }>();
    for (const row of filtered) {
      const g = groups.get(row.date) ?? { followers: 0, engagementSum: 0, count: 0 };
      g.followers += row.followers;
      g.engagementSum += row.engagement_rate;
      g.count += 1;
      groups.set(row.date, g);
    }
    const out: ReportRow[] = Array.from(groups.entries()).map(([label, g]) => ({
      label,
      followers: g.followers,
      engagement_rate: g.count > 0 ? Math.round((g.engagementSum / g.count) * 10) / 10 : 0,
    }));
    return sortAndLimit(out, config);
  }

  const latestByPlatform = new Map<string, SocialRawRow>();
  for (const row of filtered) {
    const existing = latestByPlatform.get(row.platform);
    if (!existing || row.date > existing.date) latestByPlatform.set(row.platform, row);
  }
  const out: ReportRow[] = Array.from(latestByPlatform.entries()).map(([label, r]) => ({
    label,
    followers: r.followers,
    engagement_rate: r.engagement_rate,
  }));
  return sortAndLimit(out, config);
}

export function aggregatePages(rows: PageRawRow[], config: ReportConfig): ReportRow[] {
  const filtered = applyFilters(rows, config.filters);
  const groups = new Map<
    string,
    { sessions: number; pageViews: number; bounceWeighted: number; engagementWeighted: number; engagedSessions: number }
  >();
  for (const row of filtered) {
    const key = config.dimension === "date" ? row.date : row.page_path;
    const g = groups.get(key) ?? { sessions: 0, pageViews: 0, bounceWeighted: 0, engagementWeighted: 0, engagedSessions: 0 };
    g.sessions += row.sessions;
    g.pageViews += row.page_views;
    g.bounceWeighted += row.bounce_rate * row.sessions;
    g.engagementWeighted += row.avg_engagement_sec * row.sessions;
    g.engagedSessions += row.engaged_sessions;
    groups.set(key, g);
  }
  const out: ReportRow[] = Array.from(groups.entries()).map(([label, g]) => ({
    label,
    sessions: g.sessions,
    page_views: g.pageViews,
    bounce_rate: g.sessions > 0 ? Math.round((g.bounceWeighted / g.sessions) * 10) / 10 : 0,
    engagement_rate: g.sessions > 0 ? Math.round((g.engagedSessions / g.sessions) * 1000) / 10 : 0,
    avg_engagement_sec: g.sessions > 0 ? Math.round((g.engagementWeighted / g.sessions) * 10) / 10 : 0,
    pages_per_session: g.sessions > 0 ? Math.round((g.pageViews / g.sessions) * 100) / 100 : 0,
  }));
  return sortAndLimit(out, config);
}

// ---------------------------------------------------------------------------
// Split-series aggregation — a date-grouped report broken into multiple
// series by a second dimension (SPLITTABLE_DIMENSIONS), e.g. "Sessions by
// date, split by channel". Each date becomes one row; each series value
// becomes its own field on that row (keyed by its label), so the same
// ReportRow shape works directly as multi-line/multi-bar chart data with
// one Line/Bar per discovered key, or a wide table with one column per key.
// ---------------------------------------------------------------------------

export interface SplitSeriesResult {
  rows: ReportRow[];
  seriesKeys: string[];
}

function aggregateDateSplit<T extends object>(
  rows: T[],
  filters: FilterRule[],
  getDate: (r: T) => string,
  getSplit: (r: T) => string,
  getValue: (r: T) => number
): SplitSeriesResult {
  const filtered = applyFilters(rows, filters);
  const byDate = new Map<string, Record<string, number>>();
  const seriesKeySet = new Set<string>();
  for (const row of filtered) {
    const date = getDate(row);
    const split = getSplit(row) || "Other";
    seriesKeySet.add(split);
    const bucket = byDate.get(date) ?? {};
    bucket[split] = (bucket[split] ?? 0) + getValue(row);
    byDate.set(date, bucket);
  }
  const rowsOut: ReportRow[] = Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, bucket]) => ({ label: date, ...bucket }));
  return { rows: rowsOut, seriesKeys: Array.from(seriesKeySet).sort() };
}

export function aggregateTrafficSplit(rows: TrafficRawRow[], config: ReportConfig): SplitSeriesResult {
  const metric = config.metrics[0] ?? "sessions";
  return aggregateDateSplit(
    rows,
    config.filters,
    (r) => r.date,
    (r) => r.channel,
    (r) => (metric === "conversions" ? r.conversions : r.sessions)
  );
}

export function aggregatePagesSplit(rows: PageRawRow[], config: ReportConfig): SplitSeriesResult {
  const metric = config.metrics[0] ?? "sessions";
  return aggregateDateSplit(
    rows,
    config.filters,
    (r) => r.date,
    (r) => humanizePagePath(r.page_path),
    (r) => (metric === "page_views" ? r.page_views : r.sessions)
  );
}
