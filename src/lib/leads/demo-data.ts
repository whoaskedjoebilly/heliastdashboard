// Deterministic demo leads for the CRM panel — 50 leads spread across the
// full pipeline (New → Contacted → Qualified → Appointment/Estimate → Won →
// Lost), tied to the same campaign names the demo Ads tab already shows
// (mock-data.ts) so the two don't tell disconnected stories.
import { CAMPAIGNS } from "@/components/dashboard/mock-data";
import type { Lead, LeadSource, LeadStatus } from "./types";

/** Ad spend by source for the demo account, summed from the same CAMPAIGNS
 * mock data the Ads tab shows — mapped from its display channel string
 * ("Google Ads") to the LeadSource vocabulary ("google_ads"). Lives here
 * (not a "use client" hook file) so it's importable from server-side digest
 * code for Athena as well as from the client-side spend hook. */
export function demoSpendBySource(): Partial<Record<LeadSource, number>> {
  const out: Partial<Record<LeadSource, number>> = {};
  for (const c of CAMPAIGNS) {
    const source: LeadSource | null = c.channel === "Google Ads" ? "google_ads" : c.channel === "Meta Ads" ? "meta_ads" : null;
    if (!source) continue;
    out[source] = (out[source] ?? 0) + c.spend;
  }
  return out;
}

const FIRST_NAMES = [
  "Olivia", "Liam", "Emma", "Noah", "Ava", "Ethan", "Sophia", "Mason", "Isabella", "Lucas",
  "Mia", "James", "Amelia", "Benjamin", "Harper", "Elijah", "Evelyn", "Logan", "Abigail", "Jack",
];
const LAST_NAMES = [
  "Bennett", "Reyes", "Coleman", "Foster", "Hayes", "Mercer", "Whitfield", "Sutton", "Dunbar", "Pruitt",
  "Sanders", "Osei", "Blackwood", "Nakamura", "Fitzgerald", "Alvarado",
];
const REPS = ["Jordan Lee", "Casey Kim", "Priya Patel", "Sam Torres"];

function nameAt(i: number): string {
  return `${FIRST_NAMES[i % FIRST_NAMES.length]} ${LAST_NAMES[(i * 7 + 3) % LAST_NAMES.length]}`;
}

interface LeadSeed {
  source: LeadSource;
  campaign: string | null;
  status: LeadStatus;
  /** Days ago the lead was created — resolved leads (won/lost) skew older,
   * fresh/contacted leads skew recent, same as a real pipeline. */
  daysAgo: number;
  actualValue?: number;
}

// 50 seeds: 8 new, 10 contacted, 8 qualified, 7 appointment, 12 won ($8,400
// total actual revenue), 5 lost.
const WON_VALUES = [500, 600, 650, 700, 700, 750, 750, 800, 650, 600, 700, 1000];

function buildSeeds(): LeadSeed[] {
  const sourceCycle: { source: LeadSource; campaign: string | null }[] = [
    { source: "google_ads", campaign: "Google — Migraine Relief Search" },
    { source: "google_ads", campaign: "Google — Brand Defense" },
    { source: "meta_ads", campaign: "Meta — FL-41 Retarget" },
    { source: "meta_ads", campaign: "Meta — Cold Prospecting" },
    { source: "organic", campaign: null },
    { source: "referral", campaign: "Clinic Referral Program" },
    { source: "direct", campaign: null },
  ];
  // Weighted so google_ads/meta_ads dominate (paid is the growth engine)
  // while organic/referral/direct fill in the rest — 20/15/8/5/2 of 50.
  const weighted = [
    ...Array(13).fill(sourceCycle[0]),
    ...Array(7).fill(sourceCycle[1]),
    ...Array(10).fill(sourceCycle[2]),
    ...Array(5).fill(sourceCycle[3]),
    ...Array(8).fill(sourceCycle[4]),
    ...Array(5).fill(sourceCycle[5]),
    ...Array(2).fill(sourceCycle[6]),
  ];

  const statusPlan: { status: LeadStatus; count: number; ageRange: [number, number] }[] = [
    { status: "new", count: 8, ageRange: [0, 6] },
    { status: "contacted", count: 10, ageRange: [3, 16] },
    { status: "qualified", count: 8, ageRange: [6, 22] },
    { status: "appointment", count: 7, ageRange: [10, 30] },
    { status: "won", count: 12, ageRange: [15, 55] },
    { status: "lost", count: 5, ageRange: [10, 50] },
  ];

  const seeds: LeadSeed[] = [];
  let sourceIdx = 0;
  let wonIdx = 0;
  for (const plan of statusPlan) {
    for (let i = 0; i < plan.count; i++) {
      const { source, campaign } = weighted[sourceIdx % weighted.length];
      sourceIdx += 1;
      const [lo, hi] = plan.ageRange;
      const daysAgo = hi === lo ? lo : lo + Math.round((i * 37) % (hi - lo + 1));
      const seed: LeadSeed = { source, campaign, status: plan.status, daysAgo };
      if (plan.status === "won") {
        seed.actualValue = WON_VALUES[wonIdx % WON_VALUES.length];
        wonIdx += 1;
      }
      seeds.push(seed);
    }
  }
  return seeds;
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(9, 0, 0, 0);
  return d.toISOString();
}

/** A plausible pre-close estimate for every lead, independent of how it
 * resolved — varies a little by index so the table doesn't look robotic. */
function estimatedValueAt(i: number): number {
  return 450 + (Math.round((i * 53) / 50) % 8) * 50;
}

export function demoLeads(): Lead[] {
  const seeds = buildSeeds();
  let newIdx = 0;
  return seeds.map((seed, i) => {
    const name = nameAt(i);
    const [first, last] = name.split(" ");
    const createdAt = isoDaysAgo(seed.daysAgo);
    // The first half of still-"new" leads haven't been picked up by anyone
    // yet — a realistic (and useful-for-Athena) gap to show.
    const unassigned = seed.status === "new" && newIdx++ < 4;
    return {
      id: `demo-lead-${i}`,
      name,
      email: `${first.toLowerCase()}.${last.toLowerCase()}@example.com`,
      phone: `(555) 01${i % 10}-${String(1000 + i * 37).slice(-4)}`,
      source: seed.source,
      campaign: seed.campaign,
      status: seed.status,
      assigned_to: unassigned ? null : REPS[i % REPS.length],
      estimated_value: estimatedValueAt(i),
      actual_value: seed.actualValue ?? null,
      notes: null,
      created_at: createdAt,
      updated_at: createdAt,
    };
  });
}
