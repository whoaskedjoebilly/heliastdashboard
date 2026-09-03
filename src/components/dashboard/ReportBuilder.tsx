"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Plus, Save, X } from "lucide-react";
import { Panel } from "./ui/Panel";
import { chartAxisLine, chartAxisTick, chartTooltipLabelStyle, chartTooltipStyle } from "./chart-theme";
import { useReportData } from "@/lib/reports/useReportData";
import { DATASETS, defaultConfig, formatMetricValue, type ChartType, type Dataset, type FilterRule, type ReportConfig } from "@/lib/reports/registry";
import type { RangeKey } from "@/lib/dashboard-data";

interface ReportBuilderProps {
  configured: boolean;
  clientId: string | null;
  range: RangeKey;
  onSave?: (title: string, config: ReportConfig) => Promise<{ error: string | null }>;
  initialConfig?: ReportConfig;
}

const SERIES_COLORS = ["#3ef28c", "#4ea8ff", "#f2a93e", "#c084fc", "#f2634e"];
const CHART_TYPES: { key: ChartType; label: string }[] = [
  { key: "bar", label: "Bar" },
  { key: "line", label: "Line" },
  { key: "donut", label: "Donut" },
  { key: "table", label: "Table" },
];

export function ReportBuilder({ configured, clientId, range, onSave, initialConfig }: ReportBuilderProps) {
  const [config, setConfig] = useState<ReportConfig>(initialConfig ?? defaultConfig("traffic"));
  const [saving, setSaving] = useState(false);
  const [saveTitle, setSaveTitle] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const def = DATASETS[config.dataset];
  const { rows, loading, error } = useReportData(configured, clientId, config, range);

  // Multiple metrics with different units (currency, %, seconds...) can't
  // share one chart axis meaningfully — fall back to the table view rather
  // than drawing a misleading combined chart.
  const effectiveChartType: ChartType = config.metrics.length > 1 ? "table" : config.chartType;
  const primaryMetric = config.metrics[0];
  const primaryFormat = def.metrics.find((m) => m.key === primaryMetric)?.format ?? "number";

  const chartData = useMemo(() => rows.map((r) => ({ ...r })), [rows]);

  const setDataset = (dataset: Dataset) => setConfig(defaultConfig(dataset));

  const toggleMetric = (key: string) => {
    setConfig((c) => {
      const has = c.metrics.includes(key);
      const metrics = has ? c.metrics.filter((m) => m !== key) : [...c.metrics, key];
      if (metrics.length === 0) return c;
      return { ...c, metrics, sortMetric: metrics.includes(c.sortMetric) ? c.sortMetric : metrics[0] };
    });
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

  return (
    <Panel title="Build a report" className="report-builder-panel">
      <div className="report-builder">
        <div className="rb-section">
          <div className="rb-label">Dataset</div>
          <div className="rb-chip-row">
            {(Object.keys(DATASETS) as Dataset[]).map((key) => (
              <button
                key={key}
                type="button"
                className={`rb-chip ${config.dataset === key ? "active" : ""}`}
                onClick={() => setDataset(key)}
              >
                {DATASETS[key].label}
              </button>
            ))}
          </div>
        </div>

        <div className="rb-grid">
          <div className="rb-section">
            <div className="rb-label">Metrics</div>
            <div className="rb-chip-row">
              {def.metrics.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  className={`rb-chip ${config.metrics.includes(m.key) ? "active" : ""}`}
                  onClick={() => toggleMetric(m.key)}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className="rb-section">
            <div className="rb-label">Group by</div>
            <div className="rb-chip-row">
              {def.dimensions.map((d) => (
                <button
                  key={d.key}
                  type="button"
                  className={`rb-chip ${config.dimension === d.key ? "active" : ""}`}
                  onClick={() => setConfig((c) => ({ ...c, dimension: d.key }))}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <div className="rb-section">
            <div className="rb-label">Chart</div>
            <div className="rb-chip-row">
              {CHART_TYPES.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  className={`rb-chip ${config.chartType === c.key ? "active" : ""}`}
                  onClick={() => setConfig((prev) => ({ ...prev, chartType: c.key }))}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div className="rb-section">
            <div className="rb-label">Sort &amp; limit</div>
            <div className="rb-inline-controls">
              <select className="rb-select" value={config.sortMetric} onChange={(e) => setConfig((c) => ({ ...c, sortMetric: e.target.value }))}>
                {config.metrics.map((mKey) => (
                  <option key={mKey} value={mKey}>
                    {def.metrics.find((m) => m.key === mKey)?.label ?? mKey}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="rb-chip"
                onClick={() => setConfig((c) => ({ ...c, sortDir: c.sortDir === "desc" ? "asc" : "desc" }))}
              >
                {config.sortDir === "desc" ? "High → low" : "Low → high"}
              </button>
              <input
                className="rb-select rb-limit"
                type="number"
                min={1}
                max={50}
                value={config.limit}
                onChange={(e) => setConfig((c) => ({ ...c, limit: Math.max(1, Math.min(50, Number(e.target.value) || 1)) }))}
              />
            </div>
          </div>
        </div>

        <div className="rb-section">
          <div className="rb-label">Filters</div>
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
            <table className="data-table">
              <thead>
                <tr>
                  <th>{def.dimensions.find((d) => d.key === config.dimension)?.label ?? "Group"}</th>
                  {config.metrics.map((mKey) => (
                    <th key={mKey}>{def.metrics.find((m) => m.key === mKey)?.label ?? mKey}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.label}>
                    <td>{r.label}</td>
                    {config.metrics.map((mKey) => {
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
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={chartData} margin={{ top: 6, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid stroke="#1B2721" vertical={false} />
                <XAxis dataKey="label" tick={chartAxisTick} axisLine={chartAxisLine} tickLine={false} />
                <YAxis tick={chartAxisTick} axisLine={false} tickLine={false} width={44} />
                <Tooltip
                  contentStyle={chartTooltipStyle}
                  labelStyle={chartTooltipLabelStyle}
                  formatter={(value) => formatMetricValue(Number(value), primaryFormat)}
                />
                <Line type="monotone" dataKey={primaryMetric} stroke={SERIES_COLORS[0]} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData} margin={{ top: 6, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid stroke="#1B2721" vertical={false} />
                <XAxis dataKey="label" tick={chartAxisTick} axisLine={chartAxisLine} tickLine={false} />
                <YAxis tick={chartAxisTick} axisLine={false} tickLine={false} width={44} />
                <Tooltip
                  contentStyle={chartTooltipStyle}
                  labelStyle={chartTooltipLabelStyle}
                  formatter={(value) => formatMetricValue(Number(value), primaryFormat)}
                />
                <Bar dataKey={primaryMetric} fill={SERIES_COLORS[0]} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {onSave && (
          <div className="rb-save-row">
            <input
              className="rb-select rb-save-input"
              type="text"
              placeholder="Name this report to save it…"
              value={saveTitle}
              onChange={(e) => setSaveTitle(e.target.value)}
            />
            <button type="button" className="rb-save-btn" onClick={handleSave} disabled={!saveTitle.trim() || saving}>
              <Save size={13} /> {saved ? "Saved" : saving ? "Saving…" : "Save report"}
            </button>
            {saveError && <span className="rb-save-error">{saveError}</span>}
          </div>
        )}
      </div>
    </Panel>
  );
}
