"use client";

import { useMemo, useState } from "react";
import { ChevronRight, Plus, Search, Trash2 } from "lucide-react";
import { Panel } from "./ui/Panel";
import { Dropdown } from "./ui/Dropdown";
import { CountUp } from "./ui/CountUp";
import { useLeads, type NewLeadInput } from "@/lib/leads/useLeads";
import { useCampaignSpendBySource } from "@/lib/leads/useCampaignSpend";
import { computeFunnel, computeSourceBreakdown } from "@/lib/leads/funnel";
import {
  LEAD_SOURCES,
  LEAD_STATUSES,
  leadDisplayValue,
  leadSourceLabel,
  leadStatusLabel,
  leadValueIsActual,
  type Lead,
  type LeadSource,
  type LeadStatus,
} from "@/lib/leads/types";
import { formatMetricValue } from "@/lib/reports/registry";

interface LeadsPanelProps {
  configured: boolean;
  clientId: string | null;
}

const STATUS_COLOR: Record<LeadStatus, string> = {
  new: "var(--accent-blue)",
  contacted: "var(--warn)",
  qualified: "#4ecdc4",
  appointment: "#c084fc",
  won: "var(--accent)",
  lost: "var(--text-muted)",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const EMPTY_FORM: NewLeadInput = { name: "", email: "", phone: "", source: "google_ads", campaign: "", assigned_to: "" };

export function LeadsPanel({ configured, clientId }: LeadsPanelProps) {
  const { leads, loading, addLead, updateLead, deleteLead } = useLeads(configured, clientId);
  const spendBySource = useCampaignSpendBySource(configured, clientId);

  const [statusFilter, setStatusFilter] = useState<LeadStatus | "all">("all");
  const [sourceFilter, setSourceFilter] = useState<LeadSource | "all">("all");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<NewLeadInput>(EMPTY_FORM);
  const [adding, setAdding] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter((l) => {
      if (statusFilter !== "all" && l.status !== statusFilter) return false;
      if (sourceFilter !== "all" && l.source !== sourceFilter) return false;
      if (q && !l.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [leads, statusFilter, sourceFilter, search]);

  const funnel = useMemo(() => computeFunnel(leads), [leads]);
  const bySource = useMemo(() => computeSourceBreakdown(leads, spendBySource), [leads, spendBySource]);
  const pct = (n: number) => (funnel.leads > 0 ? Math.round((n / funnel.leads) * 100) : 0);

  const handleAdd = async (close: () => void) => {
    if (!form.name.trim()) return;
    setAdding(true);
    await addLead({
      name: form.name.trim(),
      email: form.email?.trim() || null,
      phone: form.phone?.trim() || null,
      source: form.source,
      campaign: form.campaign?.trim() || null,
      assigned_to: form.assigned_to?.trim() || null,
      estimated_value: form.estimated_value ? Number(form.estimated_value) : null,
    });
    setAdding(false);
    setForm(EMPTY_FORM);
    close();
  };

  const saveLeadValue = (lead: Lead, amount: number | null) => {
    updateLead(lead.id, lead.status === "won" ? { actual_value: amount } : { estimated_value: amount });
  };

  return (
    <>
      <div className="lead-stats-row">
        <StatCard label="Total Leads" value={funnel.leads} />
        <StatCard label="New Leads" value={funnel.newCount} />
        <StatCard label="Qualified Leads" value={funnel.qualifiedPlus} />
        <StatCard label="Customers" value={funnel.won} />
        <StatCard label="Close Rate" value={funnel.closeRate} format="percent" />
        <StatCard label="Attributed Revenue" value={funnel.revenue} format="currency" />
      </div>

      <Panel title="Pipeline" className="funnel-panel">
        <div className="funnel-strip">
          <FunnelStage label="New" value={funnel.leads} />
          <ChevronRight size={16} className="funnel-arrow" />
          <FunnelStage label="Contacted" value={funnel.contactedPlus} pct={pct(funnel.contactedPlus)} />
          <ChevronRight size={16} className="funnel-arrow" />
          <FunnelStage label="Qualified" value={funnel.qualifiedPlus} pct={pct(funnel.qualifiedPlus)} />
          <ChevronRight size={16} className="funnel-arrow" />
          <FunnelStage label="Appointment/Estimate" value={funnel.appointmentPlus} pct={pct(funnel.appointmentPlus)} />
          <ChevronRight size={16} className="funnel-arrow" />
          <FunnelStage label="Won" value={funnel.won} pct={pct(funnel.won)} highlight />
          <div className="funnel-lost">
            <span className="funnel-lost-value">{funnel.lost}</span> lost
          </div>
        </div>
      </Panel>

      <Panel
        title="Leads"
        className="leads-panel"
        action={
          <div className="rb-header-actions">
            <div className="leads-search">
              <Search size={13} />
              <input type="text" placeholder="Search by name…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Dropdown trigger={<span className="dd-trigger-label">Status: {statusFilter === "all" ? "All" : leadStatusLabel(statusFilter)}</span>}>
              {(close) => (
                <div className="dd-menu">
                  <div className="dd-section-label">Filter by status</div>
                  <button
                    type="button"
                    className={`dd-item ${statusFilter === "all" ? "active" : ""}`}
                    onClick={() => {
                      setStatusFilter("all");
                      close();
                    }}
                  >
                    All statuses
                  </button>
                  {LEAD_STATUSES.map((s) => (
                    <button
                      key={s.key}
                      type="button"
                      className={`dd-item ${statusFilter === s.key ? "active" : ""}`}
                      onClick={() => {
                        setStatusFilter(s.key);
                        close();
                      }}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              )}
            </Dropdown>
            <Dropdown trigger={<span className="dd-trigger-label">Source: {sourceFilter === "all" ? "All" : leadSourceLabel(sourceFilter)}</span>}>
              {(close) => (
                <div className="dd-menu">
                  <div className="dd-section-label">Filter by source</div>
                  <button
                    type="button"
                    className={`dd-item ${sourceFilter === "all" ? "active" : ""}`}
                    onClick={() => {
                      setSourceFilter("all");
                      close();
                    }}
                  >
                    All sources
                  </button>
                  {LEAD_SOURCES.map((s) => (
                    <button
                      key={s.key}
                      type="button"
                      className={`dd-item ${sourceFilter === s.key ? "active" : ""}`}
                      onClick={() => {
                        setSourceFilter(s.key);
                        close();
                      }}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              )}
            </Dropdown>
            <Dropdown
              align="right"
              hideCaret
              className="rb-save-dd"
              trigger={
                <>
                  <Plus size={13} />
                  <span>Add lead</span>
                </>
              }
            >
              {(close) => (
                <div className="drp-menu leads-add-form">
                  <div className="dd-section-label">Add a lead</div>
                  <input
                    className="rb-select"
                    type="text"
                    placeholder="Name"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    autoFocus
                  />
                  <input
                    className="rb-select"
                    type="email"
                    placeholder="Email (optional)"
                    value={form.email ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  />
                  <input
                    className="rb-select"
                    type="tel"
                    placeholder="Phone (optional)"
                    value={form.phone ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  />
                  <select className="rb-select" value={form.source} onChange={(e) => setForm((f) => ({ ...f, source: e.target.value as LeadSource }))}>
                    {LEAD_SOURCES.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <input
                    className="rb-select"
                    type="text"
                    placeholder="Campaign (optional)"
                    value={form.campaign ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, campaign: e.target.value }))}
                  />
                  <input
                    className="rb-select"
                    type="text"
                    placeholder="Assigned to (optional)"
                    value={form.assigned_to ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, assigned_to: e.target.value }))}
                  />
                  <input
                    className="rb-select"
                    type="number"
                    placeholder="Estimated value (optional)"
                    value={form.estimated_value ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, estimated_value: e.target.value ? Number(e.target.value) : undefined }))}
                  />
                  <button type="button" className="drp-apply" onClick={() => handleAdd(close)} disabled={!form.name.trim() || adding}>
                    {adding ? "Adding…" : "Add lead"}
                  </button>
                </div>
              )}
            </Dropdown>
          </div>
        }
      >
        {loading ? (
          <div className="live-empty">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="live-empty">
            {leads.length === 0 ? "No leads yet — add one above, or wire up lead capture from your forms/ads." : "No leads match these filters."}
          </div>
        ) : (
          <div className="report-table-wrap">
            <table className="data-table leads-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Source</th>
                  <th>Campaign</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Assigned</th>
                  <th>Value</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((lead) => (
                  <tr key={lead.id}>
                    <td>
                      <div className="lead-name">{lead.name}</div>
                      {(lead.email || lead.phone) && <div className="table-sub">{[lead.email, lead.phone].filter(Boolean).join(" · ")}</div>}
                    </td>
                    <td>{leadSourceLabel(lead.source)}</td>
                    <td className={lead.campaign ? "" : "muted"}>{lead.campaign ?? "—"}</td>
                    <td className="mono">{formatDate(lead.created_at)}</td>
                    <td>
                      <select
                        className="lead-status-select"
                        style={{ color: STATUS_COLOR[lead.status] }}
                        value={lead.status}
                        onChange={(e) => updateLead(lead.id, { status: e.target.value as LeadStatus })}
                      >
                        {LEAD_STATUSES.map((s) => (
                          <option key={s.key} value={s.key}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className={lead.assigned_to ? "" : "muted"}>{lead.assigned_to ?? "Unassigned"}</td>
                    <td className="mono">
                      <ValueCell lead={lead} onSave={(amount) => saveLeadValue(lead, amount)} />
                    </td>
                    <td>
                      <button type="button" className="rb-icon-btn" onClick={() => deleteLead(lead.id)} aria-label={`Delete ${lead.name}`}>
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Performance by source" className="leads-source-panel">
        {bySource.length === 0 ? (
          <div className="live-empty">No leads yet to break down.</div>
        ) : (
          <div className="report-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Leads</th>
                  <th>Contacted</th>
                  <th>Qualified</th>
                  <th>Appts</th>
                  <th>Won</th>
                  <th>Revenue</th>
                  <th>Spend</th>
                  <th>Cost / lead</th>
                  <th>Cost / customer</th>
                </tr>
              </thead>
              <tbody>
                {bySource.map((row) => (
                  <tr key={row.source}>
                    <td>{leadSourceLabel(row.source)}</td>
                    <td className="mono">{row.leads}</td>
                    <td className="mono">{row.contactedPlus}</td>
                    <td className="mono">{row.qualifiedPlus}</td>
                    <td className="mono">{row.appointmentPlus}</td>
                    <td className="mono">{row.won}</td>
                    <td className="mono">{formatMetricValue(row.revenue, "currency")}</td>
                    <td className="mono">{row.spend != null ? formatMetricValue(row.spend, "currency") : "—"}</td>
                    <td className="mono">{row.costPerLead != null ? formatMetricValue(row.costPerLead, "currency") : "—"}</td>
                    <td className="mono">{row.costPerCustomer != null ? formatMetricValue(row.costPerCustomer, "currency") : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}

function StatCard({ label, value, format }: { label: string; value: number; format?: "number" | "currency" | "percent" }) {
  return (
    <div className="lead-stat-card">
      <div className="lead-stat-label">{label}</div>
      <div className="lead-stat-value">
        {format === "currency" ? <CountUp value={value} prefix="$" /> : format === "percent" ? <>{value}%</> : <CountUp value={value} />}
      </div>
    </div>
  );
}

function FunnelStage({ label, value, pct, highlight }: { label: string; value: number; pct?: number; highlight?: boolean }) {
  return (
    <div className={`funnel-stage ${highlight ? "highlight" : ""}`}>
      <div className="funnel-stage-value">
        <CountUp value={value} />
      </div>
      <div className="funnel-stage-label">{label}</div>
      {pct !== undefined && <div className="funnel-stage-pct">{pct}%</div>}
    </div>
  );
}

/** Click-to-edit deal value — shows the real close amount once there is one,
 * the pre-close estimate otherwise, and lets either be corrected inline
 * without a separate lead-detail view. */
function ValueCell({ lead, onSave }: { lead: Lead; onSave: (amount: number | null) => void }) {
  const [editing, setEditing] = useState(false);
  const display = leadDisplayValue(lead);
  const [draft, setDraft] = useState(String(display ?? ""));

  if (!editing) {
    return (
      <button type="button" className="lead-value-btn" onClick={() => { setDraft(String(display ?? "")); setEditing(true); }}>
        {display != null ? formatMetricValue(display, "currency") : "—"}
        {display != null && !leadValueIsActual(lead) && <span className="lead-value-est"> (est.)</span>}
      </button>
    );
  }

  const commit = () => {
    const trimmed = draft.trim();
    const n = trimmed === "" ? null : Number(trimmed);
    onSave(n !== null && Number.isNaN(n) ? null : n);
    setEditing(false);
  };

  return (
    <input
      className="lead-value-input"
      type="number"
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setEditing(false);
      }}
    />
  );
}
