"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { FileSearch, AlertTriangle, TrendingUp, Link2 } from "lucide-react";
import { Panel } from "../ui/Panel";
import { MetricHero } from "../ui/MetricHero";
import { Delta } from "../ui/Delta";
import { BACKLINKS_LONG, INDEXED_PAGES_LONG, KEYWORDS, SEO_HEALTH, TRAFFIC_LONG, endpointWindow, windowMetrics } from "../mock-data";
import { chartAxisLine, chartAxisTick, chartTooltipLabelStyle, chartTooltipStyle } from "../chart-theme";
import { useSeoData, RANGE_CONFIG, type RangeKey } from "@/lib/dashboard-data";
import type { TabDataProps } from "../types";

interface SeoTabProps extends TabDataProps {
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
  "7d": "in the last 7d",
  "30d": "in the last 30d",
  "90d": "in the last 90d",
};

export function SeoTab({ configured, clientId, clientLoading, range }: SeoTabProps) {
  const { data, loading } = useSeoData(clientId, range);
  const rangeLabel = RANGE_LABEL[range];
  const deltaLabel = DELTA_LABEL[range];

  const keywords = configured ? data.keywords : KEYWORDS;
  const organicSessions = configured ? data.organicSessions : windowMetrics(TRAFFIC_LONG, RANGE_CONFIG[range]).trend;
  const health = configured ? data.health : SEO_HEALTH;
  const isLoading = configured && (clientLoading || loading);

  // Pages indexed / backlinks are stock metrics with a real (slow) growth
  // story — see mock-data.ts's INDEXED_PAGES_LONG/BACKLINKS_LONG — unlike
  // crawl errors and avg. position, which stay a flat snapshot. Real
  // accounts have no source for any of these four yet (see the notice
  // below), so this only applies to the demo path.
  const mockIndexed = endpointWindow(INDEXED_PAGES_LONG, RANGE_CONFIG[range]);
  const mockBacklinks = endpointWindow(BACKLINKS_LONG, RANGE_CONFIG[range]);
  const indexed = configured ? health.indexed : mockIndexed.value;
  const indexedDelta = configured ? 0 : mockIndexed.deltaPct;
  const backlinks = configured ? health.backlinks : mockBacklinks.value;
  const backlinksDelta = configured ? 0 : mockBacklinks.deltaPct;

  return (
    <>
      <div className="hero-row">
        <MetricHero
          label="Pages indexed"
          value={indexed}
          deltaLabel={configured ? "vs last month" : deltaLabel}
          deltaValue={indexedDelta}
          icon={<FileSearch size={16} />}
          color="#3ef28c"
        />
        <MetricHero
          label="Crawl errors"
          value={health.crawlErrors}
          deltaLabel="vs last month"
          deltaValue={0}
          invert
          icon={<AlertTriangle size={16} />}
          color="#f2634e"
        />
        <MetricHero
          label="Avg. position"
          value={health.avgPosition}
          decimals={1}
          deltaLabel="vs last month"
          deltaValue={0}
          invert
          icon={<TrendingUp size={16} />}
          color="#4ea8ff"
        />
        <MetricHero
          label="Backlinks"
          value={backlinks}
          deltaLabel={configured ? "vs last month" : deltaLabel}
          deltaValue={backlinksDelta}
          icon={<Link2 size={16} />}
          color="#c084fc"
        />
      </div>
      {configured && (
        <p className="table-sub" style={{ marginTop: -14, marginBottom: 18 }}>
          Pages indexed, crawl errors, and backlinks need the Google Search Console integration (Phase 3/6/7) — avg.
          position is computed from tracked keywords below in the meantime.
        </p>
      )}

      <Panel title="Keyword rankings">
        {keywords.length === 0 && !isLoading ? (
          <div className="live-empty">No tracked keywords yet — connect Google Search Console.</div>
        ) : (
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
              {keywords.map((k) => (
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
        )}
      </Panel>

      <Panel title={`Organic sessions (${rangeLabel})`}>
        {organicSessions.length === 0 && !isLoading ? (
          <div className="live-empty">No organic traffic data yet.</div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={organicSessions} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid stroke="#1B2721" vertical={false} />
              <XAxis
                dataKey="date"
                tick={chartAxisTick}
                axisLine={chartAxisLine}
                tickLine={false}
                interval={Math.max(0, Math.ceil(organicSessions.length / 6) - 1)}
              />
              <YAxis tick={chartAxisTick} axisLine={false} tickLine={false} width={40} />
              <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} />
              <Bar dataKey="value" fill="#3EF28C" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Panel>
    </>
  );
}
