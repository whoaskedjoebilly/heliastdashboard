"use client";

import { formatMetricValue, type MetricFormat } from "@/lib/reports/registry";

// Rendered from fenced ```chart-bar / ```chart-donut code blocks in
// Athena's markdown replies (see the assistant's system prompt) — lets a
// breakdown across pages/channels/campaigns show up as an actual chart
// instead of a wide markdown table that overflows the narrow chat panel.

export interface AthenaChartPoint {
  label: string;
  value: number;
  note?: string;
  format?: MetricFormat;
}

interface AthenaBarChartProps {
  title?: string;
  data: AthenaChartPoint[];
}

export function AthenaBarChart({ title, data }: AthenaBarChartProps) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="ai-chart">
      {title && <div className="ai-chart-title">{title}</div>}
      <div className="ai-chart-bars">
        {data.map((d, i) => (
          <div className="ai-chart-bar-row" key={i}>
            <div className="ai-chart-bar-top">
              <span className="ai-chart-bar-label">{d.label}</span>
              <span className="ai-chart-bar-value">{formatMetricValue(d.value, d.format ?? "number")}</span>
            </div>
            <div className="ai-chart-bar-track">
              <div className="ai-chart-bar-fill" style={{ width: `${Math.max(2, (d.value / max) * 100)}%` }} />
            </div>
            {d.note && <div className="ai-chart-bar-note">{d.note}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

const DONUT_COLORS = ["#3ef28c", "#4ea8ff", "#f2a93e", "#c084fc", "#f2634e", "#6ee7d0"];

interface AthenaDonutChartProps {
  title?: string;
  data: { label: string; value: number }[];
}

export function AthenaDonutChart({ title, data }: AthenaDonutChartProps) {
  const total = data.reduce((a, d) => a + d.value, 0) || 1;
  const prefixSums = data.reduce<number[]>((acc, d, i) => [...acc, (acc[i - 1] ?? 0) + d.value], []);
  const stops = data.map((d, i) => {
    const startDeg = ((prefixSums[i - 1] ?? 0) / total) * 360;
    const endDeg = (prefixSums[i] / total) * 360;
    return `${DONUT_COLORS[i % DONUT_COLORS.length]} ${startDeg}deg ${endDeg}deg`;
  });

  return (
    <div className="ai-chart">
      {title && <div className="ai-chart-title">{title}</div>}
      <div className="ai-donut" style={{ background: `conic-gradient(${stops.join(", ")})` }}>
        <div className="ai-donut-hole" />
      </div>
      <div className="ai-donut-legend">
        {data.map((d, i) => (
          <div className="ai-donut-legend-row" key={i}>
            <span className="ai-donut-dot" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
            <span className="ai-donut-legend-label">{d.label}</span>
            <span className="ai-donut-legend-value">{Math.round((d.value / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
