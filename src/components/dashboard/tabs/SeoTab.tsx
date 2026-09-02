"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { FileSearch, AlertTriangle, TrendingUp, Link2 } from "lucide-react";
import { Panel } from "../ui/Panel";
import { MetricHero } from "../ui/MetricHero";
import { Delta } from "../ui/Delta";
import { KEYWORDS, SEO_HEALTH, TRAFFIC } from "../mock-data";
import { chartAxisLine, chartAxisTick, chartTooltipLabelStyle, chartTooltipStyle } from "../chart-theme";
import { useSeoData } from "@/lib/dashboard-data";
import type { TabDataProps } from "../types";

export function SeoTab({ configured, clientId, clientLoading }: TabDataProps) {
  const { data, loading } = useSeoData(clientId);

  const keywords = configured ? data.keywords : KEYWORDS;
  const organicSessions = configured ? data.organicSessions : TRAFFIC.slice(-14);
  const health = configured ? data.health : SEO_HEALTH;
  const isLoading = configured && (clientLoading || loading);

  return (
    <>
      <div className="hero-row">
        <MetricHero
          label="Pages indexed"
          value={health.indexed}
          deltaLabel="vs last month"
          deltaValue={0}
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
          value={health.backlinks}
          deltaLabel="vs last month"
          deltaValue={0}
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

      <Panel title="Organic sessions">
        {organicSessions.length === 0 && !isLoading ? (
          <div className="live-empty">No organic traffic data yet.</div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={organicSessions} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid stroke="#1B2721" vertical={false} />
              <XAxis dataKey="date" tick={chartAxisTick} axisLine={chartAxisLine} tickLine={false} />
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
