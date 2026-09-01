"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Panel } from "../ui/Panel";
import { MetricHero } from "../ui/MetricHero";
import { Delta } from "../ui/Delta";
import { KEYWORDS, SEO_HEALTH, TRAFFIC } from "../mock-data";
import { chartAxisLine, chartAxisTick, chartTooltipLabelStyle, chartTooltipStyle } from "../chart-theme";

export function SeoTab() {
  return (
    <>
      <div className="hero-row">
        <MetricHero label="Pages indexed" value={SEO_HEALTH.indexed} deltaLabel="vs last month" deltaValue={6} />
        <MetricHero label="Crawl errors" value={SEO_HEALTH.crawlErrors} deltaLabel="vs last month" deltaValue={-3} invert />
        <MetricHero label="Avg. position" value={SEO_HEALTH.avgPosition} decimals={1} deltaLabel="vs last month" deltaValue={-1.2} invert />
        <MetricHero label="Backlinks" value={SEO_HEALTH.backlinks} deltaLabel="vs last month" deltaValue={21} />
      </div>

      <Panel title="Keyword rankings">
        <table className="data-table">
          <thead>
            <tr>
              <th>Keyword</th>
              <th>Position</th>
              <th>Change</th>
              <th>Est. monthly volume</th>
            </tr>
          </thead>
          <tbody>
            {KEYWORDS.map((k) => (
              <tr key={k.term}>
                <td>{k.term}</td>
                <td className="mono">{k.pos}</td>
                <td className="mono">
                  <Delta value={k.delta} />
                </td>
                <td className="mono muted">{k.volume}/mo</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel title="Organic sessions">
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={TRAFFIC.slice(-14)} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid stroke="#1B2721" vertical={false} />
            <XAxis dataKey="date" tick={chartAxisTick} axisLine={chartAxisLine} tickLine={false} />
            <YAxis tick={chartAxisTick} axisLine={false} tickLine={false} width={40} />
            <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} />
            <Bar dataKey="value" fill="#3EF28C" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Panel>
    </>
  );
}
