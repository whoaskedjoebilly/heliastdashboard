// CRM types — a "lead" is what a conversion becomes once it's more than a
// number: a named person who came in through a specific source/campaign,
// working through a pipeline of real stages instead of just being counted.

export type LeadStatus = "new" | "contacted" | "qualified" | "appointment" | "won" | "lost";

/** 'google_ads' and 'meta_ads' intentionally match dashboard_ad_campaigns.platform
 * so a lead's source can be joined against real ad spend for cost-per-lead /
 * cost-per-customer math. 'organic' and 'direct' match dashboard_daily_traffic.channel
 * for the same reason; 'referral' and 'other' have no paid-spend counterpart. */
export type LeadSource = "google_ads" | "meta_ads" | "organic" | "referral" | "direct" | "other";

export interface Lead {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  source: LeadSource;
  campaign: string | null;
  status: LeadStatus;
  /** Free-text — who on the team is working this lead. No user/team table
   * exists yet, so this is just a name rather than a foreign key. */
  assigned_to: string | null;
  /** The pre-close guess at deal size, set when the lead is created. */
  estimated_value: number | null;
  /** The real close amount, filled in once a lead is won — falls back to
   * estimated_value everywhere revenue is computed, in case it was never
   * filled in after marking a lead Won. */
  actual_value: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export const LEAD_STATUSES: { key: LeadStatus; label: string }[] = [
  { key: "new", label: "New" },
  { key: "contacted", label: "Contacted" },
  { key: "qualified", label: "Qualified" },
  { key: "appointment", label: "Appointment/Estimate" },
  { key: "won", label: "Won" },
  { key: "lost", label: "Lost" },
];

export const LEAD_SOURCES: { key: LeadSource; label: string }[] = [
  { key: "google_ads", label: "Google Ads" },
  { key: "meta_ads", label: "Meta Ads" },
  { key: "organic", label: "Organic" },
  { key: "referral", label: "Referral" },
  { key: "direct", label: "Direct" },
  { key: "other", label: "Other" },
];

export function leadStatusLabel(status: LeadStatus): string {
  return LEAD_STATUSES.find((s) => s.key === status)?.label ?? status;
}

export function leadSourceLabel(source: LeadSource): string {
  return LEAD_SOURCES.find((s) => s.key === source)?.label ?? source;
}

/** The one number worth showing for a lead's deal size — the real close
 * amount once there is one, the pre-close estimate otherwise. */
export function leadDisplayValue(lead: Pick<Lead, "actual_value" | "estimated_value">): number | null {
  return lead.actual_value ?? lead.estimated_value ?? null;
}

/** Whether leadDisplayValue is a real closed amount rather than a guess —
 * callers use this to label the number "(est.)" or not. */
export function leadValueIsActual(lead: Pick<Lead, "actual_value">): boolean {
  return lead.actual_value != null;
}
