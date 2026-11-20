import { supabaseAdmin } from "@/lib/supabase/server";
import { logProviderFailure, readOAuthCallback } from "@/lib/oauth-callback";

// Step 2 of Meta OAuth. Exchanges the code for a short-lived token, then
// immediately exchanges that for a long-lived token (~60 days) since Meta
// doesn't issue refresh tokens the way Google/TikTok do — the sync job
// needs to re-run this exchange periodically before it expires.
// client_id comes from signed state.
export async function GET(req: Request) {
  const parsed = await readOAuthCallback(req);
  if (!parsed.ok) return parsed.response;
  const { origin, code, state } = parsed.value;

  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) {
    return new Response("META_APP_ID / META_APP_SECRET are not configured", { status: 500 });
  }

  const redirectUri = `${origin}/api/admin/connect/meta/callback`;

  const shortLivedUrl = new URL("https://graph.facebook.com/v19.0/oauth/access_token");
  shortLivedUrl.searchParams.set("client_id", appId);
  shortLivedUrl.searchParams.set("redirect_uri", redirectUri);
  shortLivedUrl.searchParams.set("client_secret", appSecret);
  shortLivedUrl.searchParams.set("code", code);

  const shortLivedRes = await fetch(shortLivedUrl.toString());
  if (!shortLivedRes.ok) return logProviderFailure(shortLivedRes, "Failed to exchange the authorization code");
  const { access_token: shortLivedToken } = (await shortLivedRes.json()) as { access_token: string };

  const longLivedUrl = new URL("https://graph.facebook.com/v19.0/oauth/access_token");
  longLivedUrl.searchParams.set("grant_type", "fb_exchange_token");
  longLivedUrl.searchParams.set("client_id", appId);
  longLivedUrl.searchParams.set("client_secret", appSecret);
  longLivedUrl.searchParams.set("fb_exchange_token", shortLivedToken);

  const longLivedRes = await fetch(longLivedUrl.toString());
  if (!longLivedRes.ok) return logProviderFailure(longLivedRes, "Failed to get a long-lived token");
  const { access_token, expires_in } = (await longLivedRes.json()) as { access_token: string; expires_in: number };
  const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();
  const connectedAt = new Date().toISOString();

  // One Meta token covers ads, Instagram, and the Facebook Page — write an
  // integration row per platform that was actually supplied so the sync
  // job's per-platform pulls (syncMetaAds / syncMetaPageStats) each have
  // something to run against, instead of only "meta_ads" existing.
  const rows = [{ platform: "meta_ads", externalAccountId: state.accountId }];
  if (state.igAccountId) rows.push({ platform: "instagram", externalAccountId: state.igAccountId });
  if (state.pageId) rows.push({ platform: "facebook", externalAccountId: state.pageId });

  const { error } = await supabaseAdmin!.from("dashboard_client_integrations").upsert(
    rows.map((r) => ({
      client_id: state.clientId,
      platform: r.platform,
      access_token,
      refresh_token: null,
      expires_at: expiresAt,
      connected_at: connectedAt,
      external_account_id: r.externalAccountId,
    })),
    { onConflict: "client_id,platform" }
  );

  if (error) {
    console.error("Failed to store meta integration", error.message);
    return new Response("Failed to store the connection.", { status: 500 });
  }

  return Response.redirect(`${origin}/?connected=meta`);
}
