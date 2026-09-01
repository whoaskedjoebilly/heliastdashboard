import { supabaseAdmin } from "@/lib/supabase/server";
import { decodeOAuthState } from "@/lib/oauth-state";

// Step 2 of Meta OAuth. Exchanges the code for a short-lived token, then
// immediately exchanges that for a long-lived token (~60 days) since Meta
// doesn't issue refresh tokens the way Google/TikTok do — the sync job
// (Phase 7) needs to re-run this exchange periodically before it expires.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = decodeOAuthState(url.searchParams.get("state"));
  const clientId = state?.clientId ?? null;
  const accountId = state?.accountId ?? null;
  const oauthError = url.searchParams.get("error");

  if (oauthError) {
    return new Response(`Meta returned an error: ${oauthError}`, { status: 400 });
  }
  if (!code || !clientId) {
    return new Response("Missing code or state (client_id) in callback", { status: 400 });
  }
  if (!supabaseAdmin) {
    return new Response("SUPABASE_SERVICE_ROLE_KEY is not configured", { status: 500 });
  }

  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) {
    return new Response("META_APP_ID / META_APP_SECRET are not configured", { status: 500 });
  }

  const redirectUri = `${url.origin}/api/admin/connect/meta/callback`;

  const shortLivedUrl = new URL("https://graph.facebook.com/v19.0/oauth/access_token");
  shortLivedUrl.searchParams.set("client_id", appId);
  shortLivedUrl.searchParams.set("redirect_uri", redirectUri);
  shortLivedUrl.searchParams.set("client_secret", appSecret);
  shortLivedUrl.searchParams.set("code", code);

  const shortLivedRes = await fetch(shortLivedUrl.toString());
  if (!shortLivedRes.ok) {
    return new Response(`Failed to exchange code: ${await shortLivedRes.text()}`, { status: 502 });
  }
  const { access_token: shortLivedToken } = (await shortLivedRes.json()) as { access_token: string };

  const longLivedUrl = new URL("https://graph.facebook.com/v19.0/oauth/access_token");
  longLivedUrl.searchParams.set("grant_type", "fb_exchange_token");
  longLivedUrl.searchParams.set("client_id", appId);
  longLivedUrl.searchParams.set("client_secret", appSecret);
  longLivedUrl.searchParams.set("fb_exchange_token", shortLivedToken);

  const longLivedRes = await fetch(longLivedUrl.toString());
  if (!longLivedRes.ok) {
    return new Response(`Failed to get long-lived token: ${await longLivedRes.text()}`, { status: 502 });
  }
  const { access_token, expires_in } = (await longLivedRes.json()) as { access_token: string; expires_in: number };

  const { error } = await supabaseAdmin.from("dashboard_client_integrations").upsert(
    {
      client_id: clientId,
      platform: "meta_ads",
      access_token,
      refresh_token: null,
      expires_at: new Date(Date.now() + expires_in * 1000).toISOString(),
      connected_at: new Date().toISOString(),
      external_account_id: accountId,
    },
    { onConflict: "client_id,platform" }
  );

  if (error) {
    return new Response(`Failed to store integration: ${error.message}`, { status: 500 });
  }

  return Response.redirect(`${url.origin}/admin?connected=meta`);
}
