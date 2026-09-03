"use client";

import { useEffect, useMemo, useState } from "react";
import { Panel } from "../ui/Panel";
import { Globe } from "../Globe";
import { LIVE_PAGES, makeVisitor, randomFrom } from "../mock-data";
import type { TabDataProps, Visitor } from "../types";
import { useLiveVisitors } from "@/lib/dashboard-data";
import { humanizePagePath } from "@/lib/page-labels";

export function LiveTab({ configured, clientId, clientLoading }: TabDataProps) {
  const [demoVisitors, setDemoVisitors] = useState<Visitor[]>(() =>
    Array.from({ length: 6 }, () => makeVisitor(Math.floor(Math.random() * 90)))
  );
  const [now, setNow] = useState(() => Date.now());
  const { visitors: liveVisitors, loading } = useLiveVisitors(clientId);

  // Re-render once a second so "time on page" counters keep moving.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Demo-mode only: simulate visitors arriving, leaving, and navigating.
  // Real mode gets its feed from useLiveVisitors' Supabase Realtime
  // subscription instead (Phase 9).
  useEffect(() => {
    if (configured) return;
    const t = setInterval(() => {
      setDemoVisitors((prev) => {
        const roll = Math.random();
        if (roll < 0.35 && prev.length < 22) {
          return [...prev, makeVisitor(0)];
        }
        if (roll < 0.6 && prev.length > 2) {
          const idx = Math.floor(Math.random() * prev.length);
          return prev.filter((_, i) => i !== idx);
        }
        if (prev.length > 0) {
          const idx = Math.floor(Math.random() * prev.length);
          const next = [...prev];
          next[idx] = { ...next[idx], page: randomFrom(LIVE_PAGES) };
          return next;
        }
        return prev;
      });
    }, 2400);
    return () => clearInterval(t);
  }, [configured]);

  const visitors = configured ? liveVisitors : demoVisitors;
  const isLoading = configured && (clientLoading || loading);

  const pageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    visitors.forEach((v) => {
      counts[v.page] = (counts[v.page] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([page, count]) => ({ page, count }))
      .sort((a, b) => b.count - a.count);
  }, [visitors]);

  const locationCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    visitors.forEach((v) => {
      counts[v.location] = (counts[v.location] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([location, count]) => ({ location, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [visitors]);

  const sortedVisitors = useMemo(() => [...visitors].sort((a, b) => a.enteredAt - b.enteredAt), [visitors]);

  const formatDuration = (enteredAt: number) => {
    const secs = Math.max(0, Math.floor((now - enteredAt) / 1000));
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  const maxCount = Math.max(1, ...pageCounts.map((p) => p.count));
  const maxLocationCount = Math.max(1, ...locationCounts.map((l) => l.count));

  if (isLoading) {
    return <div className="live-empty">Loading…</div>;
  }

  return (
    <>
      <div className="live-banner">
        <span className="live-dot" />
        <div>
          <div className="live-count">{visitors.length} people on your site right now</div>
          <div className="live-sub">
            {configured ? "Live from your tracking snippet — see Settings for the setup." : "Updates automatically — no need to refresh."}
          </div>
        </div>
      </div>

      <div className="grid-globe">
        <Panel title="Where visitors are" className="panel-globe">
          <Globe visitors={visitors} />
        </Panel>

        <Panel title="Top locations right now">
          <div className="channel-list">
            {locationCounts.length === 0 && <div className="live-empty">No active visitors right now.</div>}
            {locationCounts.map((l) => (
              <div className="channel-row" key={l.location}>
                <div className="channel-label">{l.location}</div>
                <div className="channel-bar-track">
                  <div className="channel-bar-fill" style={{ width: `${(l.count / maxLocationCount) * 100}%` }} />
                </div>
                <div className="channel-value">{l.count}</div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid-2">
        <Panel title="Pages being viewed now">
          <div className="channel-list">
            {pageCounts.length === 0 && <div className="live-empty">No active visitors right now.</div>}
            {pageCounts.map((p) => (
              <div className="channel-row" key={p.page}>
                <div className="channel-label">{humanizePagePath(p.page)}</div>
                <div className="channel-bar-track">
                  <div className="channel-bar-fill" style={{ width: `${(p.count / maxCount) * 100}%` }} />
                </div>
                <div className="channel-value">{p.count}</div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Active now">
          <div className="live-visitor-list">
            {sortedVisitors.length === 0 && <div className="live-empty">No active visitors right now.</div>}
            {sortedVisitors.map((v) => (
              <div className="live-visitor-row" key={v.id}>
                <span className="live-visitor-dot" />
                <div className="live-visitor-info">
                  <div className="live-visitor-page">{humanizePagePath(v.page)}</div>
                  <div className="live-visitor-meta">
                    {v.location} · {v.device}
                  </div>
                </div>
                <div className="live-visitor-time mono">{formatDuration(v.enteredAt)}</div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}
