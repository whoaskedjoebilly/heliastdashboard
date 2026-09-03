"use client";

import { Panel } from "../ui/Panel";
import { BUSINESS } from "../mock-data";
import { useIntegrationStatus } from "@/lib/dashboard-data";

interface SettingsTabProps {
  onLogout: () => void;
  businessName: string;
  businessPlan: string | null;
  clientId: string | null;
}

const PLATFORM_LABELS: Record<string, string> = {
  gsc: "Google Search Console",
  ga4: "Google Analytics 4",
  gads: "Google Ads",
  meta_ads: "Meta Ads",
  instagram: "Instagram",
  tiktok: "TikTok",
  facebook: "Facebook",
};

export function SettingsTab({ onLogout, businessName, businessPlan, clientId }: SettingsTabProps) {
  const { statuses, loading } = useIntegrationStatus(clientId);

  return (
    <>
      <Panel title="Account">
        <div className="settings-rows">
          <div className="settings-row">
            <div>
              <div className="settings-label">Business</div>
              <div className="settings-value">{businessName || BUSINESS.name}</div>
            </div>
          </div>
          <div className="settings-row">
            <div>
              <div className="settings-label">Plan</div>
              <div className="settings-value">{businessPlan || "—"}</div>
            </div>
          </div>
          {clientId && (
            <div className="settings-row">
              <div>
                <div className="settings-label">Client ID</div>
                <div className="settings-value mono muted">{clientId}</div>
                <div className="table-sub">Used to set up the live-visitor tracking snippet on your site.</div>
              </div>
            </div>
          )}
        </div>
        <button className="btn-secondary" onClick={onLogout}>
          Sign out
        </button>
      </Panel>

      {clientId && (
        <Panel title="Connected accounts">
          {loading ? (
            <div className="live-empty">Loading…</div>
          ) : (
            <div className="settings-rows">
              {statuses.map((s) => (
                <div className="settings-row" key={s.platform}>
                  <div>
                    <div className="settings-label">{PLATFORM_LABELS[s.platform] ?? s.platform}</div>
                    <div className="settings-value muted">{s.connected ? "Connected" : "Not connected"}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="table-sub" style={{ marginTop: 12 }}>
            Connections are set up by a Heliast admin via the admin-only connect routes (dashboard-live-setup.md
            Phase 6) — there&apos;s nothing to click here yet.
          </p>
        </Panel>
      )}
    </>
  );
}
