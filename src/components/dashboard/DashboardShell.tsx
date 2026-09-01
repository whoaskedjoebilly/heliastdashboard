"use client";

import { useMemo, useState } from "react";
import { BUSINESS } from "./mock-data";
import { OverviewTab } from "./tabs/OverviewTab";
import { SeoTab } from "./tabs/SeoTab";
import { AdsTab } from "./tabs/AdsTab";
import { SocialTab } from "./tabs/SocialTab";
import { LiveTab } from "./tabs/LiveTab";
import { SettingsTab } from "./tabs/SettingsTab";

interface DashboardShellProps {
  onLogout: () => void;
}

const NAV = [
  { id: "overview", label: "Overview" },
  { id: "seo", label: "SEO" },
  { id: "ads", label: "Ads" },
  { id: "social", label: "Social" },
  { id: "live", label: "Live" },
  { id: "settings", label: "Settings" },
] as const;

type TabId = (typeof NAV)[number]["id"];

export function DashboardShell({ onLogout }: DashboardShellProps) {
  const [tab, setTab] = useState<TabId>("overview");
  const [range, setRange] = useState("30d");

  const content = useMemo(() => {
    if (tab === "overview") return <OverviewTab />;
    if (tab === "seo") return <SeoTab />;
    if (tab === "ads") return <AdsTab />;
    if (tab === "social") return <SocialTab />;
    if (tab === "live") return <LiveTab />;
    return <SettingsTab onLogout={onLogout} />;
  }, [tab, onLogout]);

  const title = NAV.find((n) => n.id === tab)?.label ?? "Overview";

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-mark">
          <span className="mark-glyph">H</span>
          <span className="mark-word">Heliast</span>
        </div>
        <nav>
          {NAV.map((n) => (
            <button key={n.id} className={`nav-item ${tab === n.id ? "active" : ""}`} onClick={() => setTab(n.id)}>
              {n.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="account-chip">
            <span className="account-avatar">M</span>
            <div>
              <div className="account-name">{BUSINESS.name}</div>
              <div className="account-plan">{BUSINESS.plan} plan</div>
            </div>
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <h1>{title}</h1>
            <p className="topbar-sub">{BUSINESS.name} · performance dashboard</p>
          </div>
          <div className="range-toggle">
            {(["7d", "30d", "90d"] as const).map((r) => (
              <button key={r} className={range === r ? "active" : ""} onClick={() => setRange(r)}>
                {r}
              </button>
            ))}
          </div>
        </header>

        <div className="content">{content}</div>
      </main>
    </div>
  );
}
