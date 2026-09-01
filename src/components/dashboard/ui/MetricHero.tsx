import { CountUp } from "./CountUp";
import { Delta } from "./Delta";

interface MetricHeroProps {
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  deltaLabel: string;
  deltaValue: number;
  invert?: boolean;
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
}: MetricHeroProps) {
  return (
    <div className="metric-hero">
      <div className="metric-label">{label}</div>
      <div className="metric-value">
        <CountUp value={value} prefix={prefix} suffix={suffix} decimals={decimals} />
      </div>
      <div className="metric-delta">
        <Delta value={deltaValue} invert={invert} />
        <span className="metric-delta-caption">{deltaLabel}</span>
      </div>
    </div>
  );
}
