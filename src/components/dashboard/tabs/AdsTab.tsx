"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Panel } from "../ui/Panel";
import { MetricHero } from "../ui/MetricHero";
import { StatusDot } from "../ui/StatusDot";
import { CAMPAIGNS, CONVERSIONS } from "../mock-data";
import { chartAxisLine, chartAxisTick, chartTooltipLabelStyle, chartTooltipStyle } from "../chart-theme";

export function AdsTab() {
  const totalSpend = CAMPAIGNS.reduce((a, c) => a + c.spend, 0);
  const blendedRoas = (CAMPAIGNS.reduce((a, c) => a + c.roas * c.spend, 0) / totalSpend).toFixed(1);

  return (
    <>
      <div className="hero-row">
        <MetricHero label="Total spend (30d)" value={totalSpend} prefix="$" deltaLabel="vs prior 30d" deltaValue={-6} invert />
        <MetricHero label="Blended ROAS" value={Number(blendedRoas)} suffix="×" decimals={1} deltaLabel="vs prior 30d" deltaValue={4} />
        <MetricHero label="Conversions" value={318} deltaLabel="vs prior 30d" deltaValue={14} />
        <MetricHero label="Cost / conversion" value={14.56} prefix="$" decimals={2} deltaLabel="vs prior 30d" deltaValue={-9} invert />
      </div>

      <Panel title="Campaign performance">
        <table className="data-table">
          <thead>
            <tr>
              <th>Campaign</th>
              <th>Channel</th>
              <th>Spend</th>
              <th>ROAS</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {CAMPAIGNS.map((c) => (
              <tr key={c.name}>
                <td>{c.name}</td>
                <td className="muted">{c.channel}</td>
                <td className="mono">${c.spend.toLocaleString()}</td>
                <td className="mono">{c.roas.toFixed(1)}×</td>
                <td>
                  <span className="status-pill">
                    <StatusDot status={c.status} />
                    {c.status === "healthy" ? "Healthy" : "Needs attention"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel title="Conversions trend">
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={CONVERSIONS} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
            <defs>
              <linearGradient id="convFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#F2A93E" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#F2A93E" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#1B2721" vertical={false} />
            <XAxis dataKey="date" tick={chartAxisTick} axisLine={chartAxisLine} tickLine={false} interval={6} />
            <YAxis tick={chartAxisTick} axisLine={false} tickLine={false} width={32} />
            <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} />
            <Area type="monotone" dataKey="value" stroke="#F2A93E" strokeWidth={2} fill="url(#convFill)" />
          </AreaChart>
        </ResponsiveContainer>
      </Panel>
    </>
  );
}
