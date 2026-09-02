"use client";

import { Activity, CheckCircle2, DollarSign, Target } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Panel } from "../ui/Panel";
import { MetricHero } from "../ui/MetricHero";
import { Delta } from "../ui/Delta";
import { StatusDot } from "../ui/StatusDot";
import { DonutChannelChart } from "../ui/DonutChannelChart";
import { CAMPAIGNS, CHANNEL_SPLIT, CONVERSIONS_LONG, KEYWORDS, TRAFFIC_LONG, windowMetrics, type RangeDays } from "../mock-data";
import { chartAxisLine, chartAxisTick, chartTooltipLabelStyle, chartTooltipStyle } from "../chart-theme";
import { useOverviewData, type RangeKey } from "@/lib/dashboard-data";
import type { TabDataProps } from "../types";

interface OverviewTabProps extends TabDataProps {
  range: RangeKey;
}

const RANGE_DAYS: Record<RangeKey, RangeDays> = { "7d": 7, "30d": 30, "90d": 90 };
const RANGE_LABEL: Record<RangeKey, string> = { "7d": "7d", "30d": "30d", "90d": "90d" };

export function OverviewTab({ configured, clientId, clientLoading, range }: OverviewTabProps) {
  const { data, loading } = useOverviewData(clientId, range);
  const days = RANGE_DAYS[range];
  const rangeLabel = RANGE_LABEL[range];

  const mockSessions = windowMetrics(TRAFFIC_LONG, days);
  const mockConversions = windowMetrics(CONVERSIONS_LONG, days);

  const heroMetrics = configured
    ? {
        sessions: data.sessionsTotal,
        sessionsDelta: data.sessionsDeltaPct,
        conversions: data.conversionsTotal,
        conversionsDelta: data.conversionsDeltaPct,
        adSpend: data.adSpendTotal,
        roas: data.blendedRoas,
      }
    : {
        sessions: mockSessions.total,
        sessionsDelta: mockSessions.deltaPct,
        conversions: mockConversions.total,
        conversionsDelta: mockConversions.deltaPct,
        adSpend: 4630,
        roas: 3.6,
      };

  const traffic = configured ? data.traffic : mockSessions.trend;
  const conversionsTrend = configured ? data.conversionsTrend : mockConversions.trend;
  const channelSplit = configured ? data.channelSplit : CHANNEL_SPLIT;
  const keywords = configured ? data.topKeywords : KEYWORDS;
  const campaigns = configured ? data.campaigns : CAMPAIGNS;
  const isLoading = configured && (clientLoading || loading);

  const sessionsSpark = traffic.slice(-12).map((t) => t.value);
  const conversionsSpark = conversionsTrend.slice(-12).map((t) => t.value);
  const totalChannelSessions = channelSplit.length > 0 ? heroMetrics.sessions.toLocaleString() : "—";

  return (
    <>
      <div className="hero-row">
        <MetricHero
          label={`Sessions (${rangeLabel})`}
          value={heroMetrics.sessions}
          deltaLabel={`vs prior ${rangeLabel}`}
          deltaValue={heroMetrics.sessionsDelta}
          icon={<Activity size={16} />}
          color="#3ef28c"
          sparkline={sessionsSpark}
        />
        <MetricHero
          label="Conversions"
          value={heroMetrics.conversions}
          deltaLabel={`vs prior ${rangeLabel}`}
          deltaValue={heroMetrics.conversionsDelta}
          icon={<CheckCircle2 size={16} />}
          color="#4ea8ff"
          sparkline={conversionsSpark}
        />
        <MetricHero
          label="Ad spend"
          value={heroMetrics.adSpend}
          prefix="$"
          deltaLabel={`vs prior ${rangeLabel}`}
          deltaValue={0}
          invert
          icon={<DollarSign size={16} />}
          color="#f2a93e"
        />
        <MetricHero
          label="Blended ROAS"
          value={heroMetrics.roas}
          suffix="×"
          decimals={1}
          deltaLabel={`vs prior ${rangeLabel}`}
          deltaValue={0}
          icon={<Target size={16} />}
          color="#c084fc"
        />
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
                <XAxis
                  dataKey="date"
                  tick={chartAxisTick}
                  axisLine={chartAxisLine}
                  tickLine={false}
                  interval={Math.max(0, Math.ceil(traffic.length / 6) - 1)}
                />
                <YAxis tick={chartAxisTick} axisLine={false} tickLine={false} width={40} />
                <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} />
                <Area type="monotone" dataKey="value" stroke="#3EF28C" strokeWidth={2} fill="url(#trafficFill)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Panel>

        <Panel title="Top channels">
          {channelSplit.length === 0 && !isLoading ? (
            <div className="live-empty">No traffic data yet.</div>
          ) : (
            <DonutChannelChart data={channelSplit} centerValue={totalChannelSessions} centerLabel="sessions" />
          )}
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
