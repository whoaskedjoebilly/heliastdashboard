import { supabaseAdmin } from "@/lib/supabase/server";
import { decodeOAuthState } from "@/lib/oauth-state";

// Step 2 of TikTok OAuth.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = decodeOAuthState(url.searchParams.get("state"));
  const clientId = state?.clientId ?? null;
  const accountId = state?.accountId ?? null;
  const oauthError = url.searchParams.get("error");

  if (oauthError) {
    return new Response(`TikTok returned an error: ${oauthError}`, { status: 400 });
  }
  if (!code || !clientId) {
    return new Response("Missing code or state (client_id) in callback", { status: 400 });
  }
  if (!supabaseAdmin) {
    return new Response("SUPABASE_SERVICE_ROLE_KEY is not configured", { status: 500 });
  }

  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  if (!clientKey || !clientSecret) {
    return new Response("TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET are not configured", { status: 500 });
  }

  const redirectUri = `${url.origin}/api/admin/connect/tiktok/callback`;

  const tokenRes = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Cache-Control": "no-cache" },
    body: new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    return new Response(`Failed to exchange code for tokens: ${await tokenRes.text()}`, { status: 502 });
  }

  const { access_token, refresh_token, expires_in } = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  const { error } = await supabaseAdmin.from("dashboard_client_integrations").upsert(
    {
      client_id: clientId,
      platform: "tiktok",
      access_token,
      refresh_token: refresh_token ?? null,
      expires_at: new Date(Date.now() + expires_in * 1000).toISOString(),
      connected_at: new Date().toISOString(),
      external_account_id: accountId,
    },
    { onConflict: "client_id,platform" }
  );

  if (error) {
    return new Response(`Failed to store integration: ${error.message}`, { status: 500 });
  }

  return Response.redirect(`${url.origin}/admin?connected=tiktok`);
}
