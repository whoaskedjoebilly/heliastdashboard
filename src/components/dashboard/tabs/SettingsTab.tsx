import { Panel } from "../ui/Panel";
import { BUSINESS } from "../mock-data";

interface SettingsTabProps {
  onLogout: () => void;
}

export function SettingsTab({ onLogout }: SettingsTabProps) {
  return (
    <Panel title="Account">
      <div className="settings-rows">
        <div className="settings-row">
          <div>
            <div className="settings-label">Business</div>
            <div className="settings-value">{BUSINESS.name}</div>
          </div>
        </div>
        <div className="settings-row">
          <div>
            <div className="settings-label">Plan</div>
            <div className="settings-value">{BUSINESS.plan}</div>
          </div>
        </div>
        <div className="settings-row">
          <div>
            <div className="settings-label">Client since</div>
            <div className="settings-value">{BUSINESS.since}</div>
          </div>
        </div>
        <div className="settings-row">
          <div>
            <div className="settings-label">Connected accounts</div>
            <div className="settings-value muted">
              Google Search Console · Meta Ads · Google Ads · Instagram · TikTok · Facebook
            </div>
          </div>
        </div>
      </div>
      <button className="btn-secondary" onClick={onLogout}>
        Sign out
      </button>
    </Panel>
  );
}
