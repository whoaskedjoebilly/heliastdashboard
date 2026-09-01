"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Panel } from "../ui/Panel";
import { MetricHero } from "../ui/MetricHero";
import { Delta } from "../ui/Delta";
import { StatusDot } from "../ui/StatusDot";
import { CAMPAIGNS, CHANNEL_SPLIT, KEYWORDS, TRAFFIC } from "../mock-data";
import { chartAxisLine, chartAxisTick, chartTooltipLabelStyle, chartTooltipStyle } from "../chart-theme";

export function OverviewTab() {
  return (
    <>
      <div className="hero-row">
        <MetricHero label="Sessions (30d)" value={12480} deltaLabel="vs prior 30d" deltaValue={9} />
        <MetricHero label="Conversions" value={318} deltaLabel="vs prior 30d" deltaValue={14} />
        <MetricHero label="Ad spend" value={4630} prefix="$" deltaLabel="vs prior 30d" deltaValue={-6} invert />
        <MetricHero label="Blended ROAS" value={3.6} suffix="×" decimals={1} deltaLabel="vs prior 30d" deltaValue={4} />
      </div>

      <div className="grid-2">
        <Panel title="Traffic trend" className="panel-chart">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={TRAFFIC} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id="trafficFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3EF28C" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#3EF28C" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#1B2721" vertical={false} />
              <XAxis dataKey="date" tick={chartAxisTick} axisLine={chartAxisLine} tickLine={false} interval={6} />
              <YAxis tick={chartAxisTick} axisLine={false} tickLine={false} width={40} />
              <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} />
              <Area type="monotone" dataKey="value" stroke="#3EF28C" strokeWidth={2} fill="url(#trafficFill)" />
            </AreaChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Traffic by channel">
          <div className="channel-list">
            {CHANNEL_SPLIT.map((c) => (
              <div className="channel-row" key={c.channel}>
                <div className="channel-label">{c.channel}</div>
                <div className="channel-bar-track">
                  <div className="channel-bar-fill" style={{ width: `${c.value}%` }} />
                </div>
                <div className="channel-value">{c.value}%</div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid-2">
        <Panel title="Top keywords">
          <table className="data-table">
            <thead>
              <tr>
                <th>Keyword</th>
                <th>Position</th>
                <th>Change</th>
                <th>Volume</th>
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
                  <td className="mono muted">{k.volume}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel title="Active campaigns">
          <table className="data-table">
            <thead>
              <tr>
                <th>Campaign</th>
                <th>Spend</th>
                <th>ROAS</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {CAMPAIGNS.map((c) => (
                <tr key={c.name}>
                  <td>
                    {c.name}
                    <div className="table-sub">{c.channel}</div>
                  </td>
                  <td className="mono">${c.spend.toLocaleString()}</td>
                  <td className="mono">{c.roas.toFixed(1)}×</td>
                  <td>
                    <StatusDot status={c.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </>
  );
}
