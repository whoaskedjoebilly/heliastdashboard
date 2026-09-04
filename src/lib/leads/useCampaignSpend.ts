"use client";

// Ad spend by source, joined against leads for cost-per-lead / cost-per-
// customer math. Real accounts read dashboard_ad_campaigns.platform
// directly (already 'google_ads' | 'meta_ads', same vocabulary as
// LeadSource); the demo account sums the same CAMPAIGNS mock data the Ads
// tab shows (see demoSpendBySource in demo-data.ts).
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { demoSpendBySource } from "./demo-data";
import type { LeadSource } from "./types";

export function useCampaignSpendBySource(configured: boolean, clientId: string | null) {
  const [spend, setSpend] = useState<Partial<Record<LeadSource, number>>>(() => (configured ? {} : demoSpendBySource()));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!configured || !supabase || !clientId) {
        if (!cancelled) setSpend(configured ? {} : demoSpendBySource());
        return;
      }
      const { data, error } = await supabase.from("dashboard_ad_campaigns").select("platform, spend").eq("client_id", clientId);
      if (cancelled) return;
      if (error) {
        console.error("Failed to load campaign spend", error);
        return;
      }
      const out: Partial<Record<LeadSource, number>> = {};
      for (const row of data ?? []) {
        if (row.platform !== "google_ads" && row.platform !== "meta_ads") continue;
        const platform: LeadSource = row.platform;
        out[platform] = (out[platform] ?? 0) + (row.spend ?? 0);
      }
      setSpend(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [configured, clientId]);

  return spend;
}
