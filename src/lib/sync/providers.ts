// Per-platform data pulls for the daily sync job (dashboard-live-setup.md
// Phase 7). Each function refreshes its token if needed, calls the
// platform's real API, and upserts into the matching dashboard_* table.
// These are written against each provider's documented REST shape but have
// never run against a live, approved account — expect to need small field
// or scope adjustments once real credentials are in place.
import type { SupabaseClient } from "@supabase/supabase-js";

export interface IntegrationRow {
  client_id: string;
  platform: string;
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
  external_account_id: string | null;
}

const isExpired = (expiresAt: string | null) => !expiresAt || new Date(expiresAt).getTime() < Date.now() + 60_000;

async function refreshGoogleToken(integration: IntegrationRow): Promise<string> {
  if (!isExpired(integration.expires_at) || !integration.refresh_token) return integration.access_token;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return integration.access_token;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: integration.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) return integration.access_token;
  const { access_token, expires_in } = (await res.json()) as { access_token: string; expires_in: number };
  return access_token && expires_in ? access_token : integration.access_token;
}

async function refreshTikTokToken(integration: IntegrationRow): Promise<string> {
  if (!isExpired(integration.expires_at) || !integration.refresh_token) return integration.access_token;
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  if (!clientKey || !clientSecret) return integration.access_token;

  const res = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: integration.refresh_token,
    }),
  });
  if (!res.ok) return integration.access_token;
  const { access_token } = (await res.json()) as { access_token: string };
  return access_token ?? integration.access_token;
}

export async function syncGsc(integration: IntegrationRow, db: SupabaseClient) {
  if (!integration.external_account_id) throw new Error("gsc integration missing external_account_id (site URL)");
  const token = await refreshGoogleToken(integration);

  const endDate = new Date().toISOString().slice(0, 10);
  const start = new Date();
  start.setDate(start.getDate() - 7);
  const startDate = start.toISOString().slice(0, 10);

  const res = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(integration.external_account_id)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ startDate, endDate, dimensions: ["query"], rowLimit: 25 }),
    }
  );
  if (!res.ok) throw new Error(`GSC searchAnalytics failed: ${await res.text()}`);
  const { rows } = (await res.json()) as { rows?: { keys: string[]; position: number; impressions: number }[] };

  const today = new Date().toISOString().slice(0, 10);
  const upserts = (rows ?? []).map((r) => ({
    client_id: integration.client_id,
    keyword: r.keys[0],
    position: Math.round(r.position),
    search_volume: Math.round(r.impressions),
    checked_at: today,
  }));
  if (upserts.length === 0) return;
  const { error } = await db.from("dashboard_keyword_rankings").upsert(upserts, { onConflict: "client_id,keyword,checked_at" });
  if (error) throw error;
}

export async function syncGoogleAds(integration: IntegrationRow, db: SupabaseClient) {
  if (!integration.external_account_id) throw new Error("gads integration missing external_account_id (customer ID)");
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!developerToken) throw new Error("GOOGLE_ADS_DEVELOPER_TOKEN is not configured");
  const token = await refreshGoogleToken(integration);
  const customerId = integration.external_account_id.replace(/-/g, "");

  const query = `SELECT campaign.name, campaign.status, metrics.cost_micros, metrics.conversions_value
                 FROM campaign WHERE segments.date DURING LAST_30_DAYS`;
  const res = await fetch(`https://googleads.googleapis.com/v17/customers/${customerId}/googleAds:search`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "developer-token": developerToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`Google Ads search failed: ${await res.text()}`);
  const { results } = (await res.json()) as {
    results?: { campaign: { name: string; status: string }; metrics: { costMicros: string; conversionsValue: number } }[];
  };

  const upserts = (results ?? []).map((r) => {
    const spend = Number(r.metrics.costMicros) / 1_000_000;
    const roas = spend > 0 ? r.metrics.conversionsValue / spend : 0;
    return {
      client_id: integration.client_id,
      name: r.campaign.name,
      platform: "google_ads",
      spend,
      roas,
      status: r.campaign.status === "ENABLED" ? "healthy" : "watch",
      synced_at: new Date().toISOString(),
    };
  });
  if (upserts.length === 0) return;
  const { error } = await db.from("dashboard_ad_campaigns").upsert(upserts, { onConflict: "client_id,name,platform" });
  if (error) throw error;
}

export async function syncMetaAds(integration: IntegrationRow, db: SupabaseClient) {
  if (!integration.external_account_id) throw new Error("meta_ads integration missing external_account_id (ad account ID)");
  // Meta access tokens don't refresh via refresh_token — the long-lived
  // token from the callback is used as-is until it expires (~60 days),
  // at which point the admin needs to re-run the connect flow.
  const fields = "campaign_name,spend,purchase_roas";
  const res = await fetch(
    `https://graph.facebook.com/v19.0/${integration.external_account_id}/insights?fields=${fields}&level=campaign&date_preset=last_30d&access_token=${integration.access_token}`
  );
  if (!res.ok) throw new Error(`Meta insights failed: ${await res.text()}`);
  const { data } = (await res.json()) as {
    data?: { campaign_name: string; spend: string; purchase_roas?: { value: string }[] }[];
  };

  const upserts = (data ?? []).map((r) => {
    const spend = Number(r.spend ?? 0);
    const roas = r.purchase_roas?.[0] ? Number(r.purchase_roas[0].value) : 0;
    return {
      client_id: integration.client_id,
      name: r.campaign_name,
      platform: "meta_ads",
      spend,
      roas,
      status: spend > 0 ? "healthy" : "watch",
      synced_at: new Date().toISOString(),
    };
  });
  if (upserts.length === 0) return;
  const { error } = await db.from("dashboard_ad_campaigns").upsert(upserts, { onConflict: "client_id,name,platform" });
  if (error) throw error;
}

/** Instagram/Facebook page-level follower stats. Needs its own
 * dashboard_client_integrations row (platform "instagram" or "facebook")
 * with external_account_id set to the IG business account / Page ID — the
 * meta connect flow creates these automatically (same access_token as the
 * meta_ads row) when ig_account_id / page_id are passed to it. */
export async function syncMetaPageStats(integration: IntegrationRow, db: SupabaseClient) {
  if (!integration.external_account_id) throw new Error(`${integration.platform} integration missing external_account_id`);
  const isInstagram = integration.platform === "instagram";
  const fields = isInstagram ? "followers_count" : "fan_count";
  const res = await fetch(
    `https://graph.facebook.com/v19.0/${integration.external_account_id}?fields=${fields}&access_token=${integration.access_token}`
  );
  if (!res.ok) throw new Error(`Meta page stats failed: ${await res.text()}`);
  const json = (await res.json()) as Record<string, number>;
  const followers = isInstagram ? json.followers_count : json.fan_count;

  const { error } = await db.from("dashboard_social_stats").upsert(
    {
      client_id: integration.client_id,
      platform: integration.platform,
      followers: followers ?? 0,
      engagement_rate: 0,
      date: new Date().toISOString().slice(0, 10),
    },
    { onConflict: "client_id,platform,date" }
  );
  if (error) throw error;
}

/** GA4 page-level engagement for the last 7 days (dashboard_ga4_pages) —
 * the assistant's only source for "where are people dropping off" /
 * per-page performance questions, since dashboard_daily_traffic only has
 * site-wide daily totals. external_account_id is the GA4 property ID in
 * "properties/123456789" form. */
export async function syncGa4(integration: IntegrationRow, db: SupabaseClient) {
  if (!integration.external_account_id) throw new Error("ga4 integration missing external_account_id (GA4 property ID)");
  const token = await refreshGoogleToken(integration);

  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/${integration.external_account_id}:runReport`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        dateRanges: [{ startDate: "7daysAgo", endDate: "today" }],
        dimensions: [{ name: "date" }, { name: "pagePath" }],
        metrics: [
          { name: "sessions" },
          { name: "engagedSessions" },
          { name: "bounceRate" },
          { name: "userEngagementDuration" },
          { name: "screenPageViews" },
        ],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 500,
      }),
    }
  );
  if (!res.ok) throw new Error(`GA4 runReport failed: ${await res.text()}`);
  const { rows } = (await res.json()) as {
    rows?: { dimensionValues: { value: string }[]; metricValues: { value: string }[] }[];
  };

  const upserts = (rows ?? []).map((r) => {
    const [rawDate, pagePath] = r.dimensionValues.map((d) => d.value);
    const [sessions, engagedSessions, bounceRate, engagementDuration, pageViews] = r.metricValues.map((m) => Number(m.value));
    // GA4 returns date dimensions as "YYYYMMDD" — reshape to a Postgres date.
    const date = `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`;
    return {
      client_id: integration.client_id,
      date,
      page_path: pagePath || "/",
      sessions: Math.round(sessions || 0),
      engaged_sessions: Math.round(engagedSessions || 0),
      bounce_rate: Math.round((bounceRate || 0) * 1000) / 1000,
      avg_engagement_sec: sessions > 0 ? Math.round((engagementDuration / sessions) * 10) / 10 : 0,
      page_views: Math.round(pageViews || 0),
    };
  });
  if (upserts.length === 0) return;
  const { error } = await db.from("dashboard_ga4_pages").upsert(upserts, { onConflict: "client_id,date,page_path" });
  if (error) throw error;
}

export async function syncTiktok(integration: IntegrationRow, db: SupabaseClient) {
  const token = await refreshTikTokToken(integration);
  const res = await fetch("https://open.tiktokapis.com/v2/user/info/?fields=follower_count,likes_count", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`TikTok user info failed: ${await res.text()}`);
  const { data } = (await res.json()) as { data?: { user?: { follower_count: number; likes_count: number } } };
  const followers = data?.user?.follower_count ?? 0;
  const likes = data?.user?.likes_count ?? 0;
  const engagementRate = followers > 0 ? Math.round((likes / followers) * 1000) / 10 : 0;

  const { error } = await db.from("dashboard_social_stats").upsert(
    {
      client_id: integration.client_id,
      platform: "tiktok",
      followers,
      engagement_rate: engagementRate,
      date: new Date().toISOString().slice(0, 10),
    },
    { onConflict: "client_id,platform,date" }
  );
  if (error) throw error;
}
