"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Panel } from "../ui/Panel";
import { MetricHero } from "../ui/MetricHero";
import { Delta } from "../ui/Delta";
import { FOLLOWERS_TREND, SOCIAL_PLATFORMS, TOP_POSTS } from "../mock-data";
import { chartAxisLine, chartAxisTick, chartTooltipLabelStyle, chartTooltipStyle } from "../chart-theme";
import { useSocialData } from "@/lib/dashboard-data";
import type { TabDataProps } from "../types";

export function SocialTab({ configured, clientId, clientLoading }: TabDataProps) {
  const { data, loading } = useSocialData(clientId);

  const platforms = configured ? data.platforms : SOCIAL_PLATFORMS;
  const followersTrend = configured ? data.followersTrend : FOLLOWERS_TREND;
  // No table backs individual top posts yet — that needs per-post insights
  // from the Instagram/TikTok APIs, not just follower/engagement rollups.
  const topPosts = configured ? [] : TOP_POSTS;
  const isLoading = configured && (clientLoading || loading);

  const totalFollowers = platforms.reduce((a, p) => a + p.followers, 0);
  const avgEngagement = totalFollowers > 0 ? platforms.reduce((a, p) => a + p.engagement * p.followers, 0) / totalFollowers : 0;
  const newThisMonth = Math.round(totalFollowers * 0.072);
  const topPlatform = platforms.length > 0 ? platforms.reduce((a, b) => (b.delta > a.delta ? b : a)) : null;

  return (
    <>
      <div className="hero-row">
        <MetricHero label="Total followers" value={totalFollowers} deltaLabel="vs last month" deltaValue={0} />
        <MetricHero label="New followers" value={configured ? 0 : newThisMonth} deltaLabel="last 30 days" deltaValue={0} />
        <MetricHero label="Avg. engagement rate" value={avgEngagement} suffix="%" decimals={1} deltaLabel="vs last month" deltaValue={0} />
        <div className="metric-hero">
          <div className="metric-label">Fastest growing</div>
          <div className="metric-value metric-value-text">{topPlatform ? topPlatform.platform : "—"}</div>
          <div className="metric-delta">
            <Delta value={topPlatform?.delta ?? 0} />
            <span className="metric-delta-caption">follower growth</span>
          </div>
        </div>
      </div>

      <div className="grid-2">
        <Panel title="Follower growth" className="panel-chart">
          {followersTrend.length === 0 && !isLoading ? (
            <div className="live-empty">No follower history yet — connect Instagram, TikTok, or Facebook.</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={followersTrend} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="followerFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3EF28C" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#3EF28C" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#1B2721" vertical={false} />
                <XAxis dataKey="date" tick={chartAxisTick} axisLine={chartAxisLine} tickLine={false} interval={6} />
                <YAxis tick={chartAxisTick} axisLine={false} tickLine={false} width={40} />
                <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} />
                <Area type="monotone" dataKey="value" stroke="#3EF28C" strokeWidth={2} fill="url(#followerFill)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Panel>

        <Panel title="By platform">
          <div className="platform-list">
            {platforms.length === 0 && !isLoading && <div className="live-empty">No connected platforms yet.</div>}
            {platforms.map((p) => (
              <div className="platform-row" key={p.platform}>
                <div className="platform-name">{p.platform}</div>
                <div className="platform-followers mono">{p.followers.toLocaleString()}</div>
                <div className="platform-delta">
                  <Delta value={p.delta} />
                </div>
                <div className="platform-eng mono muted">{p.engagement}% eng.</div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel title="Top performing posts">
        {topPosts.length === 0 ? (
          <div className="live-empty">
            {configured ? "Per-post insights aren't wired up yet — only follower/engagement totals are." : "No posts yet."}
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Post</th>
                <th>Platform</th>
                <th>Reach</th>
                <th>Saves</th>
              </tr>
            </thead>
            <tbody>
              {topPosts.map((post) => (
                <tr key={post.caption}>
                  <td>{post.caption}</td>
                  <td className="muted">{post.platform}</td>
                  <td className="mono">{post.reach}</td>
                  <td className="mono muted">{post.saves}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </>
  );
}
