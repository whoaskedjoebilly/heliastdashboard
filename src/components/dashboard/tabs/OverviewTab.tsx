"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Panel } from "../ui/Panel";
import { MetricHero } from "../ui/MetricHero";
import { Delta } from "../ui/Delta";
import { StatusDot } from "../ui/StatusDot";
import { CAMPAIGNS, CHANNEL_SPLIT, KEYWORDS, TRAFFIC } from "../mock-data";
import { chartAxisLine, chartAxisTick, chartTooltipLabelStyle, chartTooltipStyle } from "../chart-theme";
import { useOverviewData } from "@/lib/dashboard-data";
import type { TabDataProps } from "../types";

export function OverviewTab({ configured, clientId, clientLoading }: TabDataProps) {
  const { data, loading } = useOverviewData(clientId);

  const heroMetrics = configured
    ? {
        sessions: data.sessions30d,
        sessionsDelta: data.sessionsDeltaPct,
        conversions: data.conversions30d,
        conversionsDelta: data.conversionsDeltaPct,
        adSpend: data.adSpend30d,
        roas: data.blendedRoas,
      }
    : { sessions: 12480, sessionsDelta: 9, conversions: 318, conversionsDelta: 14, adSpend: 4630, roas: 3.6 };

  const traffic = configured ? data.traffic : TRAFFIC;
  const channelSplit = configured ? data.channelSplit : CHANNEL_SPLIT;
  const keywords = configured ? data.topKeywords : KEYWORDS;
  const campaigns = configured ? data.campaigns : CAMPAIGNS;
  const isLoading = configured && (clientLoading || loading);

  return (
    <>
      <div className="hero-row">
        <MetricHero label="Sessions (30d)" value={heroMetrics.sessions} deltaLabel="vs prior 30d" deltaValue={heroMetrics.sessionsDelta} />
        <MetricHero label="Conversions" value={heroMetrics.conversions} deltaLabel="vs prior 30d" deltaValue={heroMetrics.conversionsDelta} />
        <MetricHero label="Ad spend" value={heroMetrics.adSpend} prefix="$" deltaLabel="vs prior 30d" deltaValue={0} invert />
        <MetricHero label="Blended ROAS" value={heroMetrics.roas} suffix="×" decimals={1} deltaLabel="vs prior 30d" deltaValue={0} />
      </div>

      <div className="grid-2">
        <Panel title="Traffic trend" className="panel-chart">
          {isLoading ? (
            <div className="live-empty">Loading…</div>
          ) : traffic.length === 0 ? (
            <div className="live-empty">No traffic data yet — connect an integration to start seeing numbers here.</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={traffic} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
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
          )}
        </Panel>

        <Panel title="Traffic by channel">
          <div className="channel-list">
            {channelSplit.length === 0 && !isLoading && <div className="live-empty">No traffic data yet.</div>}
            {channelSplit.map((c) => (
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
          {keywords.length === 0 && !isLoading ? (
            <div className="live-empty">No tracked keywords yet — connect Google Search Console.</div>
          ) : (
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
                {keywords.map((k) => (
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
          )}
        </Panel>

        <Panel title="Active campaigns">
          {campaigns.length === 0 && !isLoading ? (
            <div className="live-empty">No campaigns yet — connect Google Ads or Meta Ads.</div>
          ) : (
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
                {campaigns.map((c) => (
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
          )}
        </Panel>
      </div>
    </>
  );
}
