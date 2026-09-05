// Renders the CRM/leads pipeline into the same compact text format the rest
// of data-context.ts uses, shared by the real-account and demo digest
// builders so Athena's leads answers can never drift from what the Leads
// panel itself shows (both read through computeFunnel/computeSourceBreakdown).
import { computeFunnel, computeSourceBreakdown } from "./funnel";
import { leadSourceLabel, leadStatusLabel, type Lead, type LeadSource, type LeadStatus } from "./types";

export function buildLeadsDigestSection(leads: Lead[], spendBySource: Partial<Record<LeadSource, number>>): string {
  const lines: string[] = [];
  lines.push(`## CRM / Leads pipeline (all-time, ${leads.length} leads)`);

  if (leads.length === 0) {
    lines.push(
      "No leads recorded yet — leads are added manually (or via lead-capture forms/ads once wired up) on the " +
        "Leads tab. Site-wide conversion counts elsewhere still work without this."
    );
    return lines.join("\n");
  }

  const f = computeFunnel(leads);
  lines.push(
    `Funnel: ${f.leads} leads -> ${f.contactedPlus} contacted -> ${f.qualifiedPlus} qualified -> ` +
      `${f.appointmentPlus} appointment/estimate -> ${f.won} won (customers). ${f.lost} lost along the way. ` +
      `Close rate: ${f.closeRate}%. Revenue attributed to won leads: $${f.revenue.toLocaleString()}.`
  );
  lines.push("");

  const bySource = computeSourceBreakdown(leads, spendBySource);
  lines.push("By source (leads | contacted+ | qualified+ | appointment+ | won | revenue | spend | cost/lead | cost/customer):");
  for (const row of bySource) {
    lines.push(
      `${leadSourceLabel(row.source)} | ${row.leads} | ${row.contactedPlus} | ${row.qualifiedPlus} | ${row.appointmentPlus} | ${row.won} | ` +
        `$${row.revenue.toLocaleString()} | ${row.spend != null ? `$${row.spend.toLocaleString()}` : "n/a"} | ` +
        `${row.costPerLead != null ? `$${row.costPerLead}` : "n/a"} | ${row.costPerCustomer != null ? `$${row.costPerCustomer}` : "n/a"}`
    );
  }
  lines.push("");

  const uncontacted = leads
    .filter((l) => l.status === "new")
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, 25);
  lines.push(`Leads not yet contacted (status = New, ${uncontacted.length} of ${f.newCount} shown, most recent first):`);
  if (uncontacted.length === 0) {
    lines.push("None — every lead has been contacted at least once.");
  } else {
    lines.push("name | source | campaign | assigned to | created");
    for (const l of uncontacted) {
      lines.push(
        `${l.name} | ${leadSourceLabel(l.source)} | ${l.campaign ?? "—"} | ${l.assigned_to ?? "unassigned"} | ${l.created_at.slice(0, 10)}`
      );
    }
  }
  lines.push("");

  const recentWon = leads
    .filter((l) => l.status === "won")
    .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))
    .slice(0, 15);
  if (recentWon.length > 0) {
    lines.push(`Most recently won customers (${recentWon.length} of ${f.won} shown):`);
    lines.push("name | source | campaign | value | won date");
    for (const l of recentWon) {
      const value = l.actual_value ?? l.estimated_value ?? 0;
      lines.push(`${l.name} | ${leadSourceLabel(l.source)} | ${l.campaign ?? "—"} | $${value.toLocaleString()} | ${l.updated_at.slice(0, 10)}`);
    }
  }

  // Status labels vary by config (e.g. "Appointment/Estimate") — spell out
  // the pipeline once so the assistant doesn't have to guess what a raw
  // status value like "appointment" is displayed as in the UI.
  const stageOrder: LeadStatus[] = ["new", "contacted", "qualified", "appointment", "won", "lost"];
  lines.push("");
  lines.push(`Pipeline stages in order: ${stageOrder.map(leadStatusLabel).join(" -> ")}.`);

  return lines.join("\n");
}
