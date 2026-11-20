import { supabaseAdmin } from "@/lib/supabase/server";
import { logProviderFailure, noStoreResponse, readOAuthCallback } from "@/lib/oauth-callback";

// Step 2 of Google Analytics 4 OAuth — Google redirects here with a code
// after the admin approves consent. client_id is taken from signed state.
export async function GET(req: Request) {
  const parsed = await readOAuthCallback(req);
  if (!parsed.ok) return parsed.response;
  const { origin, code, state } = parsed.value;
  if (!state.accountId) {
    return noStoreResponse(
      "Missing account_id (GA4 property ID). Pass it as ?account_id=properties/123456789 on the connect link.",
      400
    );
  }

  const clientIdEnv = process.env.GOOGLE_CLIENT_ID;
  const clientSecretEnv = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientIdEnv || !clientSecretEnv) {
    return new Response("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not configured", { status: 500 });
  }

  const redirectUri = `${origin}/api/admin/connect/ga4/callback`;

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
      platform: "ga4",
      access_token,
      refresh_token: refresh_token ?? null,
      expires_at: new Date(Date.now() + expires_in * 1000).toISOString(),
      connected_at: new Date().toISOString(),
      external_account_id: state.accountId,
    },
    { onConflict: "client_id,platform" }
  );

  if (error) {
    console.error("Failed to store ga4 integration", error.message);
    return new Response("Failed to store the connection.", { status: 500 });
  }

  return Response.redirect(`${origin}/?connected=ga4`);
}
