export interface TrendPoint {
  date: string;
  value: number;
}

export interface ChannelSplit {
  channel: string;
  value: number;
}

export interface KeywordRow {
  term: string;
  pos: number;
  delta: number;
  volume: string;
}

export type CampaignStatus = "healthy" | "watch";

export interface CampaignRow {
  name: string;
  channel: string;
  spend: number;
  roas: number;
  status: CampaignStatus;
}

export interface SeoHealth {
  indexed: number;
  crawlErrors: number;
  avgPosition: number;
  backlinks: number;
}

export interface SocialPlatformStat {
  platform: string;
  followers: number;
  /** Raw follower count gained (or lost) over the selected range. */
  growth: number;
  delta: number;
  engagement: number;
}

export interface TopPost {
  caption: string;
  platform: string;
  reach: string;
  saves: number;
}

export interface LiveLocation {
  name: string;
  lat: number;
  lng: number;
  weight: number;
}

export interface Visitor {
  id: string;
  page: string;
  /** Empty string when the visitor didn't grant geolocation (common — it's
   * an optional browser prompt most people decline). Display code should
   * show a fallback label rather than an empty string. */
  location: string;
  /** Null when geolocation wasn't granted — NOT 0/0, which is a real
   * coordinate (off the coast of West Africa) and would otherwise show up
   * on the globe as a phantom visitor pin there. */
  lat: number | null;
  lng: number | null;
  device: string;
  enteredAt: number;
}

export interface Business {
  name: string;
  plan: string;
  since: string;
}

/** Props every data-driven tab receives from DashboardShell, which owns the
 * single useDashboardClient() fetch. */
export interface TabDataProps {
  configured: boolean;
  clientId: string | null;
  clientLoading: boolean;
}

/** Signature of useSavedReports().saveReport — shared by AnalyticsTab and the
 * floating AiAssistant, both of which save into the same lifted state. */
export type SavedReportSaver = (title: string, prompt: string, content: string) => Promise<{ error: string | null }>;
