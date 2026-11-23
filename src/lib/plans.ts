// Plan-based feature gating. This is the ONE place that decides which
// dashboard features each Heliast plan includes — edit the matrix below to
// change what a tier gets. Used by the UI (locked tabs / hidden assistant)
// and by server routes (e.g. the Athena chat API) so the rules can't be
// bypassed from the browser.

export type PlanId = "foundation" | "strategy" | "full" | "custom";

export type FeatureId =
  | "overview"
  | "seo"
  | "ads"
  | "social"
  | "live"
  | "analytics"
  | "leads"
  | "settings"
  | "assistant";

export const PLAN_LABELS: Record<PlanId, string> = {
  foundation: "Foundation",
  strategy: "Strategy",
  full: "Full management",
  custom: "Custom",
};

const ALL_FEATURES: FeatureId[] = [
  "overview",
  "seo",
  "ads",
  "social",
  "live",
  "analytics",
  "leads",
  "settings",
  "assistant",
];

const FOUNDATION: FeatureId[] = ["overview", "seo", "live", "analytics", "settings"];
const STRATEGY: FeatureId[] = [...FOUNDATION, "ads", "social", "leads", "assistant"];

/** Which features each plan includes. */
export const PLAN_FEATURES: Record<PlanId, FeatureId[]> = {
  foundation: FOUNDATION,
  strategy: STRATEGY,
  full: ALL_FEATURES,
  // Legacy / hand-negotiated deals get everything.
  custom: ALL_FEATURES,
};

/** The cheapest plan that unlocks a feature (for "upgrade to X" messaging). */
export function minimumPlanFor(feature: FeatureId): PlanId {
  const order: PlanId[] = ["foundation", "strategy", "full"];
  return order.find((p) => PLAN_FEATURES[p].includes(feature)) ?? "full";
}

/** Maps the free-text `plan` column to a PlanId. Returns null when the value
 * is empty or unrecognised. */
export function normalizePlan(plan: string | null | undefined): PlanId | null {
  const p = (plan ?? "").trim().toLowerCase();
  if (!p) return null;
  if (p.startsWith("found")) return "foundation";
  if (p.startsWith("strat")) return "strategy";
  if (p.startsWith("full") || p.startsWith("premium")) return "full";
  if (p.startsWith("custom")) return "custom";
  return null;
}

/** Whether a client on `plan` can use `feature`.
 *
 * A missing or unrecognised plan is treated as full access on purpose:
 * Heliast's own internal account has no plan, and a typo in the plan column
 * should never silently lock a paying client out of their dashboard. */
export function hasFeature(plan: string | null | undefined, feature: FeatureId): boolean {
  const id = normalizePlan(plan);
  if (!id) return true;
  return PLAN_FEATURES[id].includes(feature);
}
