// Funnel math shared by the Leads panel UI and Athena's data digest, so the
// two can never report different numbers for the same underlying leads.
//
// A lead only carries its CURRENT status, not a history of stages it passed
// through — so "reached qualified" is computed as "currently qualified,
// appointment, or won" rather than a true reached-at-least-once count (a
// lead that was qualified and later marked lost can't be distinguished from
// one that never got a reply). That keeps every number here monotonically
// non-increasing down the funnel, matching how a funnel is normally read,
// at the cost of not crediting work spent on since-lost leads.
import { leadDisplayValue, type Lead, type LeadSource } from "./types";

export interface FunnelCounts {
  leads: number;
  newCount: number;
  contactedPlus: number;
  qualifiedPlus: number;
  appointmentPlus: number;
  won: number;
  lost: number;
  revenue: number;
  /** Won ÷ total leads, as a percentage (0-100) — "of everyone we generated,
   * how many became a paying customer." */
  closeRate: number;
}

export function computeFunnel(leads: Lead[]): FunnelCounts {
  let newCount = 0;
  let contactedPlus = 0;
  let qualifiedPlus = 0;
  let appointmentPlus = 0;
  let won = 0;
  let lost = 0;
  let revenue = 0;
  for (const l of leads) {
    if (l.status === "new") newCount += 1;
    if (l.status === "contacted" || l.status === "qualified" || l.status === "appointment" || l.status === "won") contactedPlus += 1;
    if (l.status === "qualified" || l.status === "appointment" || l.status === "won") qualifiedPlus += 1;
    if (l.status === "appointment" || l.status === "won") appointmentPlus += 1;
    if (l.status === "won") {
      won += 1;
      revenue += leadDisplayValue(l) ?? 0;
    }
    if (l.status === "lost") lost += 1;
  }
  return {
    leads: leads.length,
    newCount,
    contactedPlus,
    qualifiedPlus,
    appointmentPlus,
    won,
    lost,
    revenue,
    closeRate: leads.length > 0 ? Math.round((won / leads.length) * 1000) / 10 : 0,
  };
}

export interface SourceBreakdownRow extends FunnelCounts {
  source: LeadSource;
  /** Ad spend attributed to this source (from dashboard_ad_campaigns, matched
   * by platform) — null when this source has no paid-spend counterpart
   * (organic/referral/direct/other), not just zero spend. */
  spend: number | null;
  costPerLead: number | null;
  costPerCustomer: number | null;
}

/** Breaks the funnel down by lead source, joining in ad spend where the
 * source has a paid-platform counterpart so cost-per-lead / cost-per-customer
 * can be computed — the join Athena needs for "what was our cost per
 * customer from Google Ads" style questions. */
export function computeSourceBreakdown(leads: Lead[], spendBySource: Partial<Record<LeadSource, number>>): SourceBreakdownRow[] {
  const bySource = new Map<LeadSource, Lead[]>();
  for (const l of leads) {
    const list = bySource.get(l.source) ?? [];
    list.push(l);
    bySource.set(l.source, list);
  }
  return Array.from(bySource.entries())
    .map(([source, list]) => {
      const f = computeFunnel(list);
      const spend = spendBySource[source] ?? null;
      return {
        source,
        ...f,
        spend,
        costPerLead: spend != null && f.leads > 0 ? Math.round((spend / f.leads) * 100) / 100 : null,
        costPerCustomer: spend != null && f.won > 0 ? Math.round((spend / f.won) * 100) / 100 : null,
      };
    })
    .sort((a, b) => b.leads - a.leads);
}
