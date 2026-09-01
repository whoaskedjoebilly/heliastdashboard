"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Panel } from "../ui/Panel";
import { MetricHero } from "../ui/MetricHero";
import { Delta } from "../ui/Delta";
import { FOLLOWERS_TREND, SOCIAL_PLATFORMS, TOP_POSTS } from "../mock-data";
import { chartAxisLine, chartAxisTick, chartTooltipLabelStyle, chartTooltipStyle } from "../chart-theme";

export function SocialTab() {
  const totalFollowers = SOCIAL_PLATFORMS.reduce((a, p) => a + p.followers, 0);
  const avgEngagement = (
    SOCIAL_PLATFORMS.reduce((a, p) => a + p.engagement * p.followers, 0) / totalFollowers
  ).toFixed(1);
  const newThisMonth = Math.round(totalFollowers * 0.072);
  const topPlatform = SOCIAL_PLATFORMS.reduce((a, b) => (b.delta > a.delta ? b : a));

  return (
    <>
      <div className="hero-row">
        <MetricHero label="Total followers" value={totalFollowers} deltaLabel="vs last month" deltaValue={7} />
        <MetricHero label="New followers" value={newThisMonth} deltaLabel="last 30 days" deltaValue={12} />
        <MetricHero label="Avg. engagement rate" value={Number(avgEngagement)} suffix="%" decimals={1} deltaLabel="vs last month" deltaValue={2} />
        <div className="metric-hero">
          <div className="metric-label">Fastest growing</div>
          <div className="metric-value metric-value-text">{topPlatform.platform}</div>
          <div className="metric-delta">
            <Delta value={topPlatform.delta} />
            <span className="metric-delta-caption">follower growth</span>
          </div>
        </div>
      </div>

      <div className="grid-2">
        <Panel title="Follower growth" className="panel-chart">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={FOLLOWERS_TREND} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
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
        </Panel>

        <Panel title="By platform">
          <div className="platform-list">
            {SOCIAL_PLATFORMS.map((p) => (
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
            {TOP_POSTS.map((post) => (
              <tr key={post.caption}>
                <td>{post.caption}</td>
                <td className="muted">{post.platform}</td>
                <td className="mono">{post.reach}</td>
                <td className="mono muted">{post.saves}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </>
  );
}
