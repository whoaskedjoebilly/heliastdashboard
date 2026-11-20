import { supabaseAdmin } from "@/lib/supabase/server";
import { logProviderFailure, readOAuthCallback } from "@/lib/oauth-callback";

// Step 2 of TikTok OAuth. client_id is taken from signed state.
export async function GET(req: Request) {
  const parsed = await readOAuthCallback(req);
  if (!parsed.ok) return parsed.response;
  const { origin, code, state } = parsed.value;

  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  if (!clientKey || !clientSecret) {
    return new Response("TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET are not configured", { status: 500 });
  }

  const redirectUri = `${origin}/api/admin/connect/tiktok/callback`;

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

  if (!tokenRes.ok) return logProviderFailure(tokenRes, "Failed to exchange the authorization code");

  const { access_token, refresh_token, expires_in } = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  const { error } = await supabaseAdmin!.from("dashboard_client_integrations").upsert(
    {
      client_id: state.clientId,
      platform: "tiktok",
      access_token,
      refresh_token: refresh_token ?? null,
      expires_at: new Date(Date.now() + expires_in * 1000).toISOString(),
      connected_at: new Date().toISOString(),
      external_account_id: state.accountId,
    },
    { onConflict: "client_id,platform" }
  );

  if (error) {
    console.error("Failed to store tiktok integration", error.message);
    return new Response("Failed to store the connection.", { status: 500 });
  }

  return Response.redirect(`${origin}/?connected=tiktok`);
}
