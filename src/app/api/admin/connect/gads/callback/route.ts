import { supabaseAdmin } from "@/lib/supabase/server";
import { logProviderFailure, readOAuthCallback } from "@/lib/oauth-callback";

// Step 2 of Google Ads OAuth. client_id is taken from signed state.
export async function GET(req: Request) {
  const parsed = await readOAuthCallback(req);
  if (!parsed.ok) return parsed.response;
  const { origin, code, state } = parsed.value;

  const clientIdEnv = process.env.GOOGLE_CLIENT_ID;
  const clientSecretEnv = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientIdEnv || !clientSecretEnv) {
    return new Response("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not configured", { status: 500 });
  }

  const redirectUri = `${origin}/api/admin/connect/gads/callback`;

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

  if (!tokenRes.ok) return logProviderFailure(tokenRes, "Failed to exchange the authorization code");

  const { access_token, refresh_token, expires_in } = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  const { error } = await supabaseAdmin!.from("dashboard_client_integrations").upsert(
    {
      client_id: state.clientId,
      platform: "gads",
      access_token,
      refresh_token: refresh_token ?? null,
      expires_at: new Date(Date.now() + expires_in * 1000).toISOString(),
      connected_at: new Date().toISOString(),
      external_account_id: state.accountId,
    },
    { onConflict: "client_id,platform" }
  );

  if (error) {
    console.error("Failed to store gads integration", error.message);
    return new Response("Failed to store the connection.", { status: 500 });
  }

  return Response.redirect(`${origin}/?connected=gads`);
}
