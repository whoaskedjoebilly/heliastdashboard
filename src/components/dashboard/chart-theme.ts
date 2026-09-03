// Shared Recharts styling so every chart in the dashboard reads consistently.
export const chartAxisTick = { fill: "#7C9186", fontSize: 11, fontFamily: "var(--font-ibm-plex-mono), monospace" };
export const chartAxisLine = { stroke: "#223028" };

export const chartTooltipStyle = {
  background: "#121C17",
  border: "1px solid #223028",
  borderRadius: 8,
  fontFamily: "var(--font-ibm-plex-mono), monospace",
  fontSize: 12,
  color: "#EDF3EF",
};

export const chartTooltipLabelStyle = { color: "#7C9186" };

/** Recharts' default Y-axis domain starts at 0, which is right for most bar
 * charts but flattens an area/line chart into a near-straight line whenever
 * the series has a large baseline and only moves a little around it (e.g.
 * total followers hovering near 9,000 dipping/rising by a few dozen) —
 * everything gets squashed into the top few pixels of a 0-to-9000 axis.
 * Zooms the domain to the data's actual range, padded a bit on each side,
 * so real day-to-day movement is visible instead of looking flat. */
export function chartValueDomain(points: { value: number }[], padRatio = 0.12): [number, number] {
  if (points.length === 0) return [0, 1];
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) {
    const pad = Math.max(1, Math.abs(min) * padRatio || 1);
    return [min - pad, max + pad];
  }
  const pad = (max - min) * padRatio;
  return [min - pad, max + pad];
}

/** Compact axis tick label (9,053 -> "9.1k") so a narrow Y-axis column
 * doesn't clip large values down to their last couple of digits. */
export function chartCompactTick(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1000) {
    return `${(value / 1000).toFixed(abs >= 10000 ? 0 : 1)}k`;
  }
  return `${Math.round(value)}`;
}
