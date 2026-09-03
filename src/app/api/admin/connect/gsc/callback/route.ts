import { supabaseAdmin } from "@/lib/supabase/server";
import { decodeOAuthState } from "@/lib/oauth-state";

// Step 2 of Google Search Console OAuth — Google redirects here with a code
// after the admin approves consent in the gsc/route.ts redirect above.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = decodeOAuthState(url.searchParams.get("state"));
  const clientId = state?.clientId ?? null;
  const accountId = state?.accountId ?? null;
  const oauthError = url.searchParams.get("error");

  if (oauthError) {
    return new Response(`Google returned an error: ${oauthError}`, { status: 400 });
  }
  if (!code || !clientId) {
    return new Response("Missing code or state (client_id) in callback", { status: 400 });
  }
  if (!supabaseAdmin) {
    return new Response("SUPABASE_SERVICE_ROLE_KEY is not configured", { status: 500 });
  }

  const clientIdEnv = process.env.GOOGLE_CLIENT_ID;
  const clientSecretEnv = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientIdEnv || !clientSecretEnv) {
    return new Response("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not configured", { status: 500 });
  }

  const redirectUri = `${url.origin}/api/admin/connect/gsc/callback`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientIdEnv,
      client_secret: clientSecretEnv,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    const detail = await tokenRes.text();
    return new Response(`Failed to exchange code for tokens: ${detail}`, { status: 502 });
  }

  const { access_token, refresh_token, expires_in } = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  const { error } = await supabaseAdmin.from("dashboard_client_integrations").upsert(
    {
      client_id: clientId,
      platform: "gsc",
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

  return Response.redirect(`${url.origin}/?connected=gsc`);
}
