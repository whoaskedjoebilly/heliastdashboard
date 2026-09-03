import type { CSSProperties, ReactNode } from "react";
import { CountUp } from "./CountUp";
import { Delta } from "./Delta";
import { Sparkline } from "./Sparkline";

interface MetricHeroProps {
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  deltaLabel: string;
  deltaValue: number;
  invert?: boolean;
  icon?: ReactNode;
  color?: string;
  sparkline?: number[];
  /** Small muted line under the delta row — for a headline that now shows
   * a period-scoped change (e.g. "+56 followers this week"), this is where
   * the always-current running total ("9,137 total now") lives instead. */
  note?: string;
}

export function MetricHero({
  label,
  value,
  prefix,
  suffix,
  decimals,
  deltaLabel,
  deltaValue,
  invert,
  icon,
  color,
  sparkline,
  note,
}: MetricHeroProps) {
  const sparklineData = sparkline?.map((v) => ({ value: v }));

  return (
    <div className="metric-hero" style={color ? ({ "--metric-color": color } as CSSProperties) : undefined}>
      {icon && <div className="metric-icon">{icon}</div>}
      <div className="metric-label">{label}</div>
      <div className="metric-value">
        <CountUp value={value} prefix={prefix} suffix={suffix} decimals={decimals} />
      </div>
      <div className="metric-delta">
        <Delta value={deltaValue} invert={invert} />
        <span className="metric-delta-caption">{deltaLabel}</span>
      </div>
      {note && <div className="metric-note">{note}</div>}
      {sparklineData && sparklineData.length > 1 && <Sparkline data={sparklineData} color={color} />}
    </div>
  );
}
