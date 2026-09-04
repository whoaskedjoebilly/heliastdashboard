"use client";

import { useEffect, useMemo, useState } from "react";
import { Menu, X } from "lucide-react";
import { BUSINESS } from "./mock-data";
import { OverviewTab } from "./tabs/OverviewTab";
import { SeoTab } from "./tabs/SeoTab";
import { AdsTab } from "./tabs/AdsTab";
import { SocialTab } from "./tabs/SocialTab";
import { LiveTab } from "./tabs/LiveTab";
import { AnalyticsTab } from "./tabs/AnalyticsTab";
import { SettingsTab } from "./tabs/SettingsTab";
import { AiAssistant } from "./AiAssistant";
import { useCustomReports, useDashboardClient, useSavedReports, type RangeKey } from "@/lib/dashboard-data";

interface DashboardShellProps {
  onLogout: () => void;
  /** True for a demo-account session — forces every tab to use mock data
   * even when Supabase is configured, since a demo login has no real
   * Supabase session (and therefore no RLS-visible client row) behind it. */
  forceDemo?: boolean;
}

const NAV = [
  { id: "overview", label: "Overview" },
  { id: "seo", label: "SEO" },
  { id: "ads", label: "Ads" },
  { id: "social", label: "Social" },
  { id: "live", label: "Live" },
  { id: "analytics", label: "Analytics" },
  { id: "settings", label: "Settings" },
] as const;

type TabId = (typeof NAV)[number]["id"];

// Live (real-time feed), Analytics, and Settings have no use for the global
// range toggle: Live has no time-windowed metrics, and Analytics' report
// builder has its own dedicated date-range picker (including custom
// start/end dates) that's independent of the rest of the dashboard.
const RANGE_AWARE_TABS = new Set<TabId>(["overview", "seo", "ads", "social"]);

export function DashboardShell({ onLogout, forceDemo }: DashboardShellProps) {
  const [tab, setTab] = useState<TabId>("overview");
  const [range, setRange] = useState<RangeKey>("30d");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Close the mobile drawer on Escape, and if the viewport is ever resized
  // past the mobile breakpoint while it's open (e.g. rotating a tablet).
  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileNavOpen(false);
    };
    const onResize = () => {
      if (window.innerWidth > 900) setMobileNavOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);
    };
  }, [mobileNavOpen]);

  const selectTab = (id: TabId) => {
    setTab(id);
    setMobileNavOpen(false);
  };

  // Prevent the page behind the drawer from scrolling while it's open.
  useEffect(() => {
    if (!mobileNavOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileNavOpen]);
  const { client, loading, configured: reallyConfigured } = useDashboardClient();

  // A demo session has no real Supabase auth session, so even though
  // Supabase itself is configured, there's no RLS-visible client row to
  // fetch — every tab should render the mock dashboard instead.
  const configured = reallyConfigured && !forceDemo;
  const businessName = configured ? client?.name ?? BUSINESS.name : BUSINESS.name;
  const businessPlan = configured ? client?.plan ?? BUSINESS.plan : BUSINESS.plan;
  const clientId = configured ? client?.id ?? null : null;
  const noClientLinked = configured && !loading && !client;
  const { reports, loading: reportsLoading, saveReport, deleteReport } = useSavedReports(clientId);
  const {
    reports: customReports,
    loading: customReportsLoading,
    saveCustomReport,
    deleteCustomReport,
  } = useCustomReports(clientId);

  const content = useMemo(() => {
    if (noClientLinked) {
      return (
        <div className="live-empty">
          No client profile is linked to your account yet. Ask your Heliast admin to create one — see the
          Settings tab for your account details.
        </div>
      );
    }
    if (tab === "overview") return <OverviewTab configured={configured} clientId={clientId} clientLoading={loading} range={range} />;
    if (tab === "seo") return <SeoTab configured={configured} clientId={clientId} clientLoading={loading} range={range} />;
    if (tab === "ads") return <AdsTab configured={configured} clientId={clientId} clientLoading={loading} range={range} />;
    if (tab === "social") return <SocialTab configured={configured} clientId={clientId} clientLoading={loading} range={range} />;
    if (tab === "live") return <LiveTab configured={configured} clientId={clientId} clientLoading={loading} />;
    if (tab === "analytics")
      return (
        <AnalyticsTab
          configured={configured}
          clientId={clientId}
          reports={reports}
          reportsLoading={reportsLoading}
          deleteReport={deleteReport}
          customReports={customReports}
          customReportsLoading={customReportsLoading}
          saveCustomReport={saveCustomReport}
          deleteCustomReport={deleteCustomReport}
        />
      );
    return <SettingsTab onLogout={onLogout} businessName={businessName} businessPlan={businessPlan} clientId={clientId} />;
  }, [
    tab,
    onLogout,
    configured,
    clientId,
    loading,
    noClientLinked,
    businessName,
    businessPlan,
    reports,
    reportsLoading,
    deleteReport,
    customReports,
    customReportsLoading,
    saveCustomReport,
    deleteCustomReport,
    range,
  ]);

  const title = NAV.find((n) => n.id === tab)?.label ?? "Overview";

  const navContent = (
    <>
      <nav>
        {NAV.map((n) => (
          <button key={n.id} className={`nav-item ${tab === n.id ? "active" : ""}`} onClick={() => selectTab(n.id)}>
            {n.label}
          </button>
        ))}
      </nav>
      <div className="sidebar-foot">
        <div className="account-chip">
          <span className="account-avatar">{businessName.charAt(0).toUpperCase()}</span>
          <div>
            <div className="account-name">{businessName}</div>
            <div className="account-plan">{businessPlan ?? "—"} plan</div>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-mark">
          <span className="mark-glyph">H</span>
          <span className="mark-word">Heliast</span>
          <button
            type="button"
            className="hamburger-btn"
            onClick={() => setMobileNavOpen((v) => !v)}
            aria-label={mobileNavOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileNavOpen}
          >
            {mobileNavOpen ? <X size={19} /> : <Menu size={19} />}
          </button>
        </div>
        <div className="sidebar-desktop-nav">{navContent}</div>
      </aside>

      {/* Rendered as a sibling of .sidebar, not a descendant — .sidebar has
       * backdrop-filter, which per spec creates a new containing block for
       * position:fixed descendants. Safari/WebKit enforces that strictly
       * (unlike Chromium), which broke this drawer on real iOS devices when
       * it lived inside .sidebar. */}
      <div className={`mobile-drawer ${mobileNavOpen ? "open" : ""}`}>{navContent}</div>
      {mobileNavOpen && <div className="sidebar-backdrop" onClick={() => setMobileNavOpen(false)} />}

      <main className="main">
        <header className="topbar">
          <div>
            <h1>{title}</h1>
            <p className="topbar-sub">{businessName} · performance dashboard</p>
          </div>
          {RANGE_AWARE_TABS.has(tab) && (
            <div className="range-toggle">
              {(
                [
                  ["today", "Today"],
                  ["yesterday", "Yesterday"],
                  ["7d", "7d"],
                  ["30d", "30d"],
                  ["90d", "90d"],
                ] as const
              ).map(([r, label]) => (
                <button key={r} className={range === r ? "active" : ""} onClick={() => setRange(r)}>
                  {label}
                </button>
              ))}
            </div>
          )}
        </header>

        <div className="content">{content}</div>
      </main>

      <AiAssistant configured={configured} clientId={clientId} businessName={businessName} saveReport={saveReport} />
    </div>
  );
}
