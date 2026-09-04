"use client";

// CRUD for the CRM/leads pipeline. Unifies the demo and real-account paths
// behind one interface (unlike useReportData, this one needs *writes*, not
// just a read-only aggregate) — demo mode mutates local React state so the
// pipeline is fully interactive to try out, real accounts hit dashboard_leads
// directly (RLS-scoped to the caller's own client_id, same as
// useSavedReports/useCustomReports in dashboard-data.ts).
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { demoLeads } from "./demo-data";
import type { Lead, LeadSource, LeadStatus } from "./types";

export interface NewLeadInput {
  name: string;
  email?: string | null;
  phone?: string | null;
  source: LeadSource;
  campaign?: string | null;
  status?: LeadStatus;
  assigned_to?: string | null;
  estimated_value?: number | null;
}

export type LeadPatch = Partial<
  Pick<Lead, "name" | "email" | "phone" | "source" | "campaign" | "status" | "assigned_to" | "estimated_value" | "actual_value" | "notes">
>;

function localId(): string {
  return `local-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
}

export function useLeads(configured: boolean, clientId: string | null) {
  const [demoState, setDemoState] = useState<Lead[]>(() => demoLeads());
  const [realLeads, setRealLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!configured || !supabase || !clientId) {
      setRealLeads([]);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("dashboard_leads")
      .select("id, name, email, phone, source, campaign, status, assigned_to, estimated_value, actual_value, notes, created_at, updated_at")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });
    if (error) console.error("Failed to load leads", error);
    setRealLeads((data as Lead[]) ?? []);
    setLoading(false);
  }, [configured, clientId]);

  useEffect(() => {
    (async () => {
      await refresh();
    })();
  }, [refresh]);

  const addLead = useCallback(
    async (input: NewLeadInput): Promise<{ error: string | null }> => {
      const now = new Date().toISOString();
      if (!configured) {
        const lead: Lead = {
          id: localId(),
          name: input.name,
          email: input.email ?? null,
          phone: input.phone ?? null,
          source: input.source,
          campaign: input.campaign ?? null,
          status: input.status ?? "new",
          assigned_to: input.assigned_to ?? null,
          estimated_value: input.estimated_value ?? null,
          actual_value: null,
          notes: null,
          created_at: now,
          updated_at: now,
        };
        setDemoState((prev) => [lead, ...prev]);
        return { error: null };
      }
      if (!supabase || !clientId) return { error: "Not signed in" };
      const { error } = await supabase.from("dashboard_leads").insert({ client_id: clientId, ...input });
      if (error) return { error: error.message };
      await refresh();
      return { error: null };
    },
    [configured, clientId, refresh]
  );

  const updateLead = useCallback(
    async (id: string, patch: LeadPatch) => {
      const now = new Date().toISOString();
      if (!configured) {
        setDemoState((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch, updated_at: now } : l)));
        return;
      }
      if (!supabase) return;
      const { error } = await supabase
        .from("dashboard_leads")
        .update({ ...patch, updated_at: now })
        .eq("id", id);
      if (error) console.error("Failed to update lead", error);
      await refresh();
    },
    [configured, refresh]
  );

  const deleteLead = useCallback(
    async (id: string) => {
      if (!configured) {
        setDemoState((prev) => prev.filter((l) => l.id !== id));
        return;
      }
      if (!supabase) return;
      const { error } = await supabase.from("dashboard_leads").delete().eq("id", id);
      if (error) console.error("Failed to delete lead", error);
      await refresh();
    },
    [configured, refresh]
  );

  return { leads: configured ? realLeads : demoState, loading, addLead, updateLead, deleteLead };
}
