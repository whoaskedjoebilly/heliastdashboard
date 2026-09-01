"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Panel } from "../ui/Panel";
import { MetricHero } from "../ui/MetricHero";
import { StatusDot } from "../ui/StatusDot";
import { CAMPAIGNS, CONVERSIONS } from "../mock-data";
import { chartAxisLine, chartAxisTick, chartTooltipLabelStyle, chartTooltipStyle } from "../chart-theme";
import { useAdsData } from "@/lib/dashboard-data";
import type { TabDataProps } from "../types";

export function AdsTab({ configured, clientId, clientLoading }: TabDataProps) {
  const { data, loading } = useAdsData(clientId);

  const campaigns = configured ? data.campaigns : CAMPAIGNS;
  const conversionsTrend = configured ? data.conversionsTrend : CONVERSIONS;
  const conversions30d = configured ? data.conversions30d : 318;
  const isLoading = configured && (clientLoading || loading);

  const totalSpend = campaigns.reduce((a, c) => a + c.spend, 0);
  const blendedRoas = totalSpend > 0 ? campaigns.reduce((a, c) => a + c.roas * c.spend, 0) / totalSpend : 0;
  const costPerConversion = conversions30d > 0 ? totalSpend / conversions30d : 0;

  return (
    <>
      <div className="hero-row">
        <MetricHero label="Total spend (30d)" value={totalSpend} prefix="$" deltaLabel="vs prior 30d" deltaValue={0} invert />
        <MetricHero label="Blended ROAS" value={blendedRoas} suffix="×" decimals={1} deltaLabel="vs prior 30d" deltaValue={0} />
        <MetricHero label="Conversions" value={conversions30d} deltaLabel="vs prior 30d" deltaValue={0} />
        <MetricHero label="Cost / conversion" value={costPerConversion} prefix="$" decimals={2} deltaLabel="vs prior 30d" deltaValue={0} invert />
      </div>

      <Panel title="Campaign performance">
        {campaigns.length === 0 && !isLoading ? (
          <div className="live-empty">No campaigns yet — connect Google Ads or Meta Ads.</div>
        ) : (
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
              {campaigns.map((c) => (
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
        )}
      </Panel>

      <Panel title="Conversions trend">
        {conversionsTrend.length === 0 && !isLoading ? (
          <div className="live-empty">No conversion data yet.</div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={conversionsTrend} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
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
        )}
      </Panel>
    </>
  );
}
