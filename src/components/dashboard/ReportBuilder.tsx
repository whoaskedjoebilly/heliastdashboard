"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  ArrowDownWideNarrow,
  ArrowUpWideNarrow,
  BarChart3,
  Check,
  Download,
  LineChart as LineChartIcon,
  Layers,
  Plus,
  PieChart as PieChartIcon,
  Save,
  Table2,
  X,
} from "lucide-react";
import { Panel } from "./ui/Panel";
import { Dropdown } from "./ui/Dropdown";
import { DateRangePicker } from "./DateRangePicker";
import { chartAxisLine, chartAxisTick, chartCompactTick, chartLegendStyle, chartTooltipLabelStyle, chartTooltipStyle } from "./chart-theme";
import { useReportData } from "@/lib/reports/useReportData";
import {
  DATASETS,
  defaultConfig,
  formatMetricValue,
  SPLITTABLE_DIMENSIONS,
  type ChartType,
  type Dataset,
  type FilterRule,
  type ReportConfig,
} from "@/lib/reports/registry";
import { DEFAULT_REPORT_RANGE } from "@/lib/reports/date-range";
import { humanizePagePath } from "@/lib/page-labels";

interface ReportBuilderProps {
  configured: boolean;
  clientId: string | null;
  onSave?: (title: string, config: ReportConfig) => Promise<{ error: string | null }>;
  initialConfig?: ReportConfig;
}

const SERIES_COLORS = ["#3ef28c", "#4ea8ff", "#f2a93e", "#c084fc", "#f2634e"];

/** Chart/table rows grouped by date carry a raw "YYYY-MM-DD" label (kept
 * unambiguous for grouping/sorting) — reformat just for display so a
 * 90-point axis shows "Aug 23" instead of a full ISO string. */
function shortDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Grouped rows carry whatever raw value the dimension holds — a route slug
 * for "page_path", an ISO date for "date" — reformat just for display so a
 * report reads like "FL-41 glasses product page" / "Aug 23" instead of raw
 * data plumbing. */
function displayLabel(rawLabel: string, dataset: Dataset, dimension: string): string {
  if (dimension === "date") return shortDateLabel(rawLabel);
  if (dataset === "pages" && dimension === "page_path") return humanizePagePath(rawLabel);
  return rawLabel;
}
function csvCell(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(headerCols: string[], dataRows: (string | number)[][], filename: string) {
  const csv = [headerCols.map(csvCell).join(","), ...dataRows.map((r) => r.map(csvCell).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const CHART_TYPES: { key: ChartType; label: string; icon: typeof Table2 }[] = [
  { key: "bar", label: "Bar chart", icon: BarChart3 },
  { key: "line", label: "Line chart", icon: LineChartIcon },
  { key: "donut", label: "Donut chart", icon: PieChartIcon },
  { key: "table", label: "Table", icon: Table2 },
];

export function ReportBuilder({ configured, clientId, onSave, initialConfig }: ReportBuilderProps) {
  const [config, setConfig] = useState<ReportConfig>(initialConfig ?? defaultConfig("traffic"));
  const [saveTitle, setSaveTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const def = DATASETS[config.dataset];
  const range = config.range ?? DEFAULT_REPORT_RANGE;
  const { rows, loading, error, seriesKeys } = useReportData(configured, clientId, config);
  const isSplit = seriesKeys !== null && seriesKeys.length > 0;

  // Multiple metrics with different units (currency, %, seconds...) can't
  // share one chart axis meaningfully, and a donut can't show a breakdown
  // that's split into multiple series over time — both fall back to the
  // table view rather than drawing a misleading chart.
  const effectiveChartType: ChartType = config.metrics.length > 1 || (isSplit && config.chartType === "donut") ? "table" : config.chartType;
  const primaryMetric = config.metrics[0];
  const primaryFormat = def.metrics.find((m) => m.key === primaryMetric)?.format ?? "number";
  const activeChart = CHART_TYPES.find((c) => c.key === config.chartType) ?? CHART_TYPES[0];

  const splittableFields = SPLITTABLE_DIMENSIONS[config.dataset] ?? [];
  const canSplit = config.dimension === "date" && config.metrics.length === 1 && splittableFields.length > 0;
  const splitLabel = config.splitBy ? def.dimensions.find((d) => d.key === config.splitBy)?.label ?? config.splitBy : null;

  const chartData = useMemo(
    () => rows.map((r) => ({ ...r, label: displayLabel(String(r.label), config.dataset, config.dimension) })),
    [rows, config.dataset, config.dimension]
  );
  // Target ~6 ticks regardless of how many points there are — matches the
  // interval used everywhere else in the app. 8 was too dense: on a narrow
  // panel (mobile, or this panel next to the sidebar) that many date labels
  // run together with no gap between them.
  const xAxisInterval = Math.max(0, Math.ceil(chartData.length / 6) - 1);

  const setDataset = (dataset: Dataset) => setConfig((c) => ({ ...defaultConfig(dataset, c.range), range: c.range }));

  const toggleMetric = (key: string) => {
    setConfig((c) => {
      const has = c.metrics.includes(key);
      const metrics = has ? c.metrics.filter((m) => m !== key) : [...c.metrics, key];
      if (metrics.length === 0) return c;
      // Splitting into multiple series only makes sense with exactly one
      // metric selected — adding a second clears any active split.
      return { ...c, metrics, sortMetric: metrics.includes(c.sortMetric) ? c.sortMetric : metrics[0], splitBy: metrics.length > 1 ? null : c.splitBy };
    });
  };

  const handleExport = () => {
    if (rows.length === 0) return;
    const dimLabel = def.dimensions.find((d) => d.key === config.dimension)?.label ?? "Group";
    if (isSplit && seriesKeys) {
      const header = [dimLabel, ...seriesKeys];
      const dataRows = rows.map((r) => [displayLabel(String(r.label), config.dataset, config.dimension), ...seriesKeys.map((k) => r[k] ?? 0)]);
      downloadCsv(header, dataRows, `${config.dataset}-report.csv`);
      return;
    }
    const header = [dimLabel, ...config.metrics.map((m) => def.metrics.find((dm) => dm.key === m)?.label ?? m)];
    const dataRows = rows.map((r) => [displayLabel(String(r.label), config.dataset, config.dimension), ...config.metrics.map((m) => r[m] ?? 0)]);
    downloadCsv(header, dataRows, `${config.dataset}-report.csv`);
  };

  const addFilter = () => {
    setConfig((c) => ({ ...c, filters: [...c.filters, { field: def.dimensions[0].key, op: "eq", value: "" }] }));
  };
  const updateFilter = (idx: number, patch: Partial<FilterRule>) => {
    setConfig((c) => ({ ...c, filters: c.filters.map((f, i) => (i === idx ? { ...f, ...patch } : f)) }));
  };
  const removeFilter = (idx: number) => {
    setConfig((c) => ({ ...c, filters: c.filters.filter((_, i) => i !== idx) }));
  };

  const handleSave = async () => {
    if (!onSave || !saveTitle.trim()) return;
    setSaving(true);
    setSaveError(null);
    const { error: err } = await onSave(saveTitle.trim(), config);
    setSaving(false);
    if (err) {
      setSaveError(err);
    } else {
      setSaved(true);
      setSaveTitle("");
      setTimeout(() => setSaved(false), 2000);
    }
  };

  const filterableFields = [...def.dimensions.map((d) => ({ key: d.key, label: d.label })), ...def.metrics.map((m) => ({ key: m.key, label: m.label }))];
  const sortMetricLabel = def.metrics.find((m) => m.key === config.sortMetric)?.label ?? config.sortMetric;

  return (
    <Panel
      title="Build a report"
      className="report-builder-panel"
      action={
        <div className="rb-header-actions">
          <DateRangePicker value={range} onChange={(r) => setConfig((c) => ({ ...c, range: r }))} />
          <button type="button" className="dd-trigger" onClick={handleExport} disabled={rows.length === 0}>
            <Download size={13} />
            <span>Export CSV</span>
          </button>
          {onSave && (
            <Dropdown
              align="right"
              hideCaret
              className="rb-save-dd"
              trigger={
                <>
                  <Save size={13} />
                  <span>{saved ? "Saved" : "Save"}</span>
                </>
              }
            >
              {() => (
                <div className="drp-menu rb-save-menu">
                  <div className="dd-section-label">Save this report</div>
                  <input
                    className="rb-select rb-save-input"
                    type="text"
                    placeholder="Name this report…"
                    value={saveTitle}
                    onChange={(e) => setSaveTitle(e.target.value)}
                    autoFocus
                  />
                  <button type="button" className="drp-apply" onClick={handleSave} disabled={!saveTitle.trim() || saving}>
                    {saving ? "Saving…" : "Save report"}
                  </button>
                  {saveError && <span className="rb-save-error">{saveError}</span>}
                </div>
              )}
            </Dropdown>
          )}
        </div>
      }
    >
      <div className="report-builder">
        <div className="rb-toolbar">
          <Dropdown
            trigger={<span className="dd-trigger-label">{def.label}</span>}
          >
            {(close) => (
              <div className="dd-menu">
                <div className="dd-section-label">Report on</div>
                {(Object.keys(DATASETS) as Dataset[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    className={`dd-item ${config.dataset === key ? "active" : ""}`}
                    onClick={() => {
                      setDataset(key);
                      close();
                    }}
                  >
                    <span>
                      <span className="dd-item-title">{DATASETS[key].label}</span>
                      <span className="dd-item-sub">{DATASETS[key].description}</span>
                    </span>
                    {config.dataset === key && <Check size={13} />}
                  </button>
                ))}
              </div>
            )}
          </Dropdown>

          <Dropdown trigger={<span className="dd-trigger-label">Columns: {config.metrics.length}</span>}>
            {() => (
              <div className="dd-menu">
                <div className="dd-section-label">Metrics to show</div>
                {def.metrics.map((m) => (
                  <button key={m.key} type="button" className={`dd-item ${config.metrics.includes(m.key) ? "active" : ""}`} onClick={() => toggleMetric(m.key)}>
                    {m.label}
                    {config.metrics.includes(m.key) && <Check size={13} />}
                  </button>
                ))}
              </div>
            )}
          </Dropdown>

          <Dropdown trigger={<span className="dd-trigger-label">Group by: {def.dimensions.find((d) => d.key === config.dimension)?.label}</span>}>
            {(close) => (
              <div className="dd-menu">
                <div className="dd-section-label">Group by</div>
                {def.dimensions.map((d) => (
                  <button
                    key={d.key}
                    type="button"
                    className={`dd-item ${config.dimension === d.key ? "active" : ""}`}
                    onClick={() => {
                      setConfig((c) => ({ ...c, dimension: d.key, splitBy: d.key === "date" ? c.splitBy : null }));
                      close();
                    }}
                  >
                    {d.label}
                    {config.dimension === d.key && <Check size={13} />}
                  </button>
                ))}
              </div>
            )}
          </Dropdown>

          {canSplit && (
            <Dropdown
              trigger={
                <span className="dd-trigger-label dd-trigger-icon">
                  <Layers size={13} /> Split by: {splitLabel ?? "None"}
                </span>
              }
            >
              {(close) => (
                <div className="dd-menu">
                  <div className="dd-section-label">Split into multiple series</div>
                  <button
                    type="button"
                    className={`dd-item ${!config.splitBy ? "active" : ""}`}
                    onClick={() => {
                      setConfig((c) => ({ ...c, splitBy: null }));
                      close();
                    }}
                  >
                    None
                    {!config.splitBy && <Check size={13} />}
                  </button>
                  {splittableFields.map((field) => (
                    <button
                      key={field}
                      type="button"
                      className={`dd-item ${config.splitBy === field ? "active" : ""}`}
                      onClick={() => {
                        setConfig((c) => ({ ...c, splitBy: field }));
                        close();
                      }}
                    >
                      {def.dimensions.find((d) => d.key === field)?.label ?? field}
                      {config.splitBy === field && <Check size={13} />}
                    </button>
                  ))}
                </div>
              )}
            </Dropdown>
          )}

          {config.dimension !== "date" && (
            <Dropdown
              trigger={
                <span className="dd-trigger-label">
                  Sort: {sortMetricLabel} · Top {config.limit}
                </span>
              }
            >
              {() => (
                <div className="dd-menu">
                  <div className="dd-section-label">Sort by</div>
                  {config.metrics.map((mKey) => (
                    <button
                      key={mKey}
                      type="button"
                      className={`dd-item ${config.sortMetric === mKey ? "active" : ""}`}
                      onClick={() => setConfig((c) => ({ ...c, sortMetric: mKey }))}
                    >
                      {def.metrics.find((m) => m.key === mKey)?.label ?? mKey}
                      {config.sortMetric === mKey && <Check size={13} />}
                    </button>
                  ))}
                  <div className="dd-divider" />
                  <div className="dd-item-row">
                    <button
                      type="button"
                      className={`dd-item ${config.sortDir === "desc" ? "active" : ""}`}
                      onClick={() => setConfig((c) => ({ ...c, sortDir: "desc" }))}
                    >
                      <ArrowDownWideNarrow size={13} /> High → low
                    </button>
                    <button
                      type="button"
                      className={`dd-item ${config.sortDir === "asc" ? "active" : ""}`}
                      onClick={() => setConfig((c) => ({ ...c, sortDir: "asc" }))}
                    >
                      <ArrowUpWideNarrow size={13} /> Low → high
                    </button>
                  </div>
                  <div className="dd-divider" />
                  <div className="dd-section-label">Rows to show</div>
                  <input
                    className="rb-select rb-limit"
                    type="number"
                    min={1}
                    max={50}
                    value={config.limit}
                    onChange={(e) => setConfig((c) => ({ ...c, limit: Math.max(1, Math.min(50, Number(e.target.value) || 1)) }))}
                  />
                </div>
              )}
            </Dropdown>
          )}

          <Dropdown
            trigger={
              <span className="dd-trigger-label dd-trigger-icon">
                <activeChart.icon size={13} /> {activeChart.label}
              </span>
            }
          >
            {(close) => (
              <div className="dd-menu">
                <div className="dd-section-label">Chart type</div>
                {CHART_TYPES.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    className={`dd-item ${config.chartType === c.key ? "active" : ""}`}
                    onClick={() => {
                      setConfig((prev) => ({ ...prev, chartType: c.key }));
                      close();
                    }}
                  >
                    <span className="dd-item-icon-label">
                      <c.icon size={13} /> {c.label}
                    </span>
                    {config.chartType === c.key && <Check size={13} />}
                  </button>
                ))}
              </div>
            )}
          </Dropdown>
        </div>

        <div className="rb-section rb-filters-section">
          <div className="rb-label">Filters (optional)</div>
          <div className="rb-filters">
            {config.filters.map((f, idx) => (
              <div className="rb-filter-row" key={idx}>
                <select className="rb-select" value={f.field} onChange={(e) => updateFilter(idx, { field: e.target.value })}>
                  {filterableFields.map((field) => (
                    <option key={field.key} value={field.key}>
                      {field.label}
                    </option>
                  ))}
                </select>
                <select className="rb-select" value={f.op} onChange={(e) => updateFilter(idx, { op: e.target.value as FilterRule["op"] })}>
                  <option value="eq">is</option>
                  <option value="gt">&gt;</option>
                  <option value="gte">&ge;</option>
                  <option value="lt">&lt;</option>
                  <option value="lte">&le;</option>
                </select>
                <input
                  className="rb-select"
                  type="text"
                  placeholder="value"
                  value={f.value}
                  onChange={(e) => updateFilter(idx, { value: e.target.value })}
                />
                <button type="button" className="rb-icon-btn" onClick={() => removeFilter(idx)} aria-label="Remove filter">
                  <X size={13} />
                </button>
              </div>
            ))}
            <button type="button" className="rb-add-filter" onClick={addFilter}>
              <Plus size={13} /> Add filter
            </button>
          </div>
        </div>

        <div className="rb-preview">
          {loading ? (
            <div className="live-empty">Loading…</div>
          ) : error ? (
            <div className="login-error">{error}</div>
          ) : rows.length === 0 ? (
            <div className="live-empty">No data for this dataset yet in the selected range.</div>
          ) : effectiveChartType === "table" ? (
            <div className="report-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{def.dimensions.find((d) => d.key === config.dimension)?.label ?? "Group"}</th>
                    {isSplit && seriesKeys
                      ? seriesKeys.map((k) => <th key={k}>{k}</th>)
                      : config.metrics.map((mKey) => <th key={mKey}>{def.metrics.find((m) => m.key === mKey)?.label ?? mKey}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.label}>
                      <td>{displayLabel(String(r.label), config.dataset, config.dimension)}</td>
                      {isSplit && seriesKeys
                        ? seriesKeys.map((k) => (
                            <td className="mono" key={k}>
                              {formatMetricValue(Number(r[k] ?? 0), primaryFormat)}
                            </td>
                          ))
                        : config.metrics.map((mKey) => {
                            const format = def.metrics.find((m) => m.key === mKey)?.format ?? "number";
                            return (
                              <td className="mono" key={mKey}>
                                {formatMetricValue(Number(r[mKey] ?? 0), format)}
                              </td>
                            );
                          })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : effectiveChartType === "donut" ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={chartData} dataKey={primaryMetric} nameKey="label" innerRadius={60} outerRadius={100} paddingAngle={2}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={SERIES_COLORS[i % SERIES_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={chartTooltipStyle}
                  labelStyle={chartTooltipLabelStyle}
                  formatter={(value) => formatMetricValue(Number(value), primaryFormat)}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : effectiveChartType === "line" ? (
            <ResponsiveContainer width="100%" height={isSplit ? 300 : 260}>
              <LineChart data={chartData} margin={{ top: 6, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid stroke="#1B2721" vertical={false} />
                <XAxis dataKey="label" tick={chartAxisTick} axisLine={chartAxisLine} tickLine={false} interval={xAxisInterval} />
                <YAxis tick={chartAxisTick} axisLine={false} tickLine={false} width={48} tickFormatter={chartCompactTick} />
                <Tooltip
                  contentStyle={chartTooltipStyle}
                  labelStyle={chartTooltipLabelStyle}
                  formatter={(value) => formatMetricValue(Number(value), primaryFormat)}
                />
                {isSplit && seriesKeys ? (
                  <>
                    <Legend wrapperStyle={chartLegendStyle} iconType="line" iconSize={8} />
                    {seriesKeys.map((k, i) => (
                      <Line key={k} type="monotone" dataKey={k} name={k} stroke={SERIES_COLORS[i % SERIES_COLORS.length]} strokeWidth={2} dot={false} />
                    ))}
                  </>
                ) : (
                  <Line type="monotone" dataKey={primaryMetric} stroke={SERIES_COLORS[0]} strokeWidth={2} dot={false} />
                )}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height={isSplit ? 300 : 260}>
              <BarChart data={chartData} margin={{ top: 6, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid stroke="#1B2721" vertical={false} />
                <XAxis dataKey="label" tick={chartAxisTick} axisLine={chartAxisLine} tickLine={false} interval={xAxisInterval} />
                <YAxis tick={chartAxisTick} axisLine={false} tickLine={false} width={48} tickFormatter={chartCompactTick} />
                <Tooltip
                  contentStyle={chartTooltipStyle}
                  labelStyle={chartTooltipLabelStyle}
                  formatter={(value) => formatMetricValue(Number(value), primaryFormat)}
                />
                {isSplit && seriesKeys ? (
                  <>
                    <Legend wrapperStyle={chartLegendStyle} iconType="square" iconSize={8} />
                    {seriesKeys.map((k, i) => (
                      <Bar key={k} dataKey={k} name={k} fill={SERIES_COLORS[i % SERIES_COLORS.length]} radius={[3, 3, 0, 0]} />
                    ))}
                  </>
                ) : (
                  <Bar dataKey={primaryMetric} fill={SERIES_COLORS[0]} radius={[3, 3, 0, 0]} />
                )}
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </Panel>
  );
}
