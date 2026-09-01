import type { CampaignStatus } from "../types";

interface StatusDotProps {
  status: CampaignStatus;
}

export function StatusDot({ status }: StatusDotProps) {
  const color = status === "healthy" ? "var(--accent)" : status === "watch" ? "var(--warn)" : "var(--text-muted)";
  return <span className="status-dot" style={{ background: color }} />;
}
