// Date range handling for the Analytics report builder. Unlike the rest of
// the dashboard (which shares one Today/Yesterday/7d/30d/90d toggle across
// every tab), the report builder gets its own range control — including an
// arbitrary custom start/end date — since a saved report should keep
// working with whatever window it was built for, not whatever range the
// user happens to have the rest of the dashboard set to.

export type ReportRangeKey = "today" | "yesterday" | "7d" | "30d" | "90d" | "custom";

export interface ReportRange {
  key: ReportRangeKey;
  startStr: string;
  endStr: string;
  label: string;
}

function dateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}
function parseDateStr(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function formatShort(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function formatFull(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export const PRESET_ORDER: Exclude<ReportRangeKey, "custom">[] = ["today", "yesterday", "7d", "30d", "90d"];

const PRESET_LABELS: Record<Exclude<ReportRangeKey, "custom">, string> = {
  today: "Today",
  yesterday: "Yesterday",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
};

export function presetRange(key: Exclude<ReportRangeKey, "custom">): ReportRange {
  const today = new Date();
  const label = PRESET_LABELS[key];
  switch (key) {
    case "today":
      return { key, startStr: dateStr(today), endStr: dateStr(today), label };
    case "yesterday": {
      const y = addDays(today, -1);
      return { key, startStr: dateStr(y), endStr: dateStr(y), label };
    }
    case "7d":
      return { key, startStr: dateStr(addDays(today, -6)), endStr: dateStr(today), label };
    case "30d":
      return { key, startStr: dateStr(addDays(today, -29)), endStr: dateStr(today), label };
    case "90d":
      return { key, startStr: dateStr(addDays(today, -89)), endStr: dateStr(today), label };
  }
}

/** Builds a "custom" range from two YYYY-MM-DD strings, swapping them if the
 * end date was picked before the start date. */
export function customRange(startStr: string, endStr: string): ReportRange {
  const [s, e] = startStr <= endStr ? [startStr, endStr] : [endStr, startStr];
  const sDate = parseDateStr(s);
  const eDate = parseDateStr(e);
  const label = s === e ? formatFull(sDate) : `${formatShort(sDate)} – ${formatFull(eDate)}`;
  return { key: "custom", startStr: s, endStr: e, label };
}

export const DEFAULT_REPORT_RANGE: ReportRange = presetRange("30d");
