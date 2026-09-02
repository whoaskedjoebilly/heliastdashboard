import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import type { ChannelSplit } from "../types";

const COLORS = ["#3ef28c", "#4ea8ff", "#f2a93e", "#7c9186", "#c084fc"];

interface DonutChannelChartProps {
  data: ChannelSplit[];
  centerValue: string;
  centerLabel: string;
}

export function DonutChannelChart({ data, centerValue, centerLabel }: DonutChannelChartProps) {
  if (data.length === 0) return null;

  return (
    <div className="donut-wrap">
      <div className="donut-chart-box">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="channel" innerRadius="70%" outerRadius="100%" paddingAngle={2} strokeWidth={0} isAnimationActive={false}>
              {data.map((entry, i) => (
                <Cell key={entry.channel} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="donut-center">
          <div className="donut-center-value">{centerValue}</div>
          <div className="donut-center-label">{centerLabel}</div>
        </div>
      </div>
      <div className="donut-legend">
        {data.map((c, i) => (
          <div className="donut-legend-row" key={c.channel}>
            <span className="donut-legend-dot" style={{ background: COLORS[i % COLORS.length] }} />
            <span className="donut-legend-label">{c.channel}</span>
            <span className="donut-legend-value">{c.value}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
