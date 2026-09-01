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
  location: string;
  lat: number;
  lng: number;
  device: string;
  enteredAt: number;
}

export interface Business {
  name: string;
  plan: string;
  since: string;
}
