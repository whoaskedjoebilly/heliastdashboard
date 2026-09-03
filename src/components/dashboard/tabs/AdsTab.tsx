"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { DollarSign, Target, CheckCircle2, Receipt } from "lucide-react";
import { Panel } from "../ui/Panel";
import { MetricHero } from "../ui/MetricHero";
import { StatusDot } from "../ui/StatusDot";
import { AD_SPEND_LONG, CAMPAIGNS, CONVERSIONS_LONG, windowMetrics } from "../mock-data";
import { chartAxisLine, chartAxisTick, chartTooltipLabelStyle, chartTooltipStyle } from "../chart-theme";
import { useAdsData, RANGE_CONFIG, type RangeKey } from "@/lib/dashboard-data";
import type { TabDataProps } from "../types";

interface AdsTabProps extends TabDataProps {
  range: RangeKey;
}

const RANGE_LABEL: Record<RangeKey, string> = {
  today: "Today",
  yesterday: "Yesterday",
  "7d": "7d",
  "30d": "30d",
  "90d": "90d",
};
const DELTA_LABEL: Record<RangeKey, string> = {
  today: "vs yesterday",
  yesterday: "vs day before",
  "7d": "vs prior 7d",
  "30d": "vs prior 30d",
  "90d": "vs prior 90d",
};

export function AdsTab({ configured, clientId, clientLoading, range }: AdsTabProps) {
  const { data, loading } = useAdsData(clientId, range);
  const rangeLabel = RANGE_LABEL[range];
  const deltaLabel = DELTA_LABEL[range];

  const mockConversions = windowMetrics(CONVERSIONS_LONG, RANGE_CONFIG[range]);
  const mockAdSpend = windowMetrics(AD_SPEND_LONG, RANGE_CONFIG[range]);

  const campaigns = configured ? data.campaigns : CAMPAIGNS;
  const conversionsTrend = configured ? data.conversionsTrend : mockConversions.trend;
  const conversionsTotal = configured ? data.conversionsTotal : mockConversions.total;
  const conversionsDeltaPct = configured ? data.conversionsDeltaPct : mockConversions.deltaPct;
  const isLoading = configured && (clientLoading || loading);

  // dashboard_ad_campaigns is a point-in-time sync snapshot, not daily
  // history, so a real account's total spend genuinely can't be windowed
  // yet — only the demo path (synthetic daily series) varies by range.
  // Blended ROAS is always the spend-weighted average across the current
  // campaign list, independent of the windowed spend headline above it.
  const campaignSpend = campaigns.reduce((a, c) => a + c.spend, 0);
  const totalSpend = configured ? campaignSpend : mockAdSpend.total;
  const spendDeltaPct = configured ? 0 : mockAdSpend.deltaPct;
  const spendDeltaLabel = configured ? "current total" : deltaLabel;
  const blendedRoas = campaignSpend > 0 ? campaigns.reduce((a, c) => a + c.roas * c.spend, 0) / campaignSpend : 0;
  const costPerConversion = conversionsTotal > 0 ? totalSpend / conversionsTotal : 0;
  const conversionsSpark = conversionsTrend.slice(-12).map((t) => t.value);

  return (
    <>
      <div className="hero-row">
        <MetricHero
          label={configured ? "Total spend" : `Total spend (${rangeLabel})`}
          value={totalSpend}
          prefix="$"
          deltaLabel={spendDeltaLabel}
          deltaValue={spendDeltaPct}
          invert
          icon={<DollarSign size={16} />}
          color="#f2a93e"
        />
        <MetricHero
          label="Blended ROAS"
          value={blendedRoas}
          suffix="×"
          decimals={1}
          deltaLabel="all active campaigns"
          deltaValue={0}
          icon={<Target size={16} />}
          color="#c084fc"
        />
        <MetricHero
          label="Conversions"
          value={conversionsTotal}
          deltaLabel={deltaLabel}
          deltaValue={conversionsDeltaPct}
          icon={<CheckCircle2 size={16} />}
          color="#4ea8ff"
          sparkline={conversionsSpark}
        />
        <MetricHero
          label="Cost / conversion"
          value={costPerConversion}
          prefix="$"
          decimals={2}
          deltaLabel={deltaLabel}
          deltaValue={0}
          invert
          icon={<Receipt size={16} />}
          color="#3ef28c"
        />
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

      <Panel title={`Conversions trend (${rangeLabel})`}>
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
              <XAxis
                dataKey="date"
                tick={chartAxisTick}
                axisLine={chartAxisLine}
                tickLine={false}
                interval={Math.max(0, Math.ceil(conversionsTrend.length / 6) - 1)}
              />
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
