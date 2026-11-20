import { isAdminRequest } from "@/lib/admin-auth";
import { encodeOAuthState } from "@/lib/oauth-state";
import { trustedOrigin } from "@/lib/request-origin";

// Step 1 of Google Ads OAuth. Same Google OAuth app as gsc/ga4, different
// scope. Never linked from the client dashboard — visit directly as an admin:
// /api/admin/connect/gads?client_id=<uuid>&account_id=<customer-id>&token=<ADMIN_ACCESS_TOKEN>
// account_id here is the Google Ads customer ID (the 10-digit number in the
// top right of the Ads UI, with or without dashes — dashes are stripped
// before use in syncGoogleAds).
export async function GET(req: Request) {
  if (!isAdminRequest(req)) {
    return new Response("Not authorized", { status: 401, headers: { "Cache-Control": "private, no-store" } });
  }

  const url = new URL(req.url);
  const clientId = url.searchParams.get("client_id");
  if (!clientId) {
    return new Response("Missing client_id query param", { status: 400 });
  }
  const accountId = url.searchParams.get("account_id");

  const clientIdEnv = process.env.GOOGLE_CLIENT_ID;
  if (!clientIdEnv) {
    return new Response("GOOGLE_CLIENT_ID is not configured", { status: 500 });
  }
  if (!process.env.GOOGLE_ADS_DEVELOPER_TOKEN) {
    return new Response("GOOGLE_ADS_DEVELOPER_TOKEN is not configured", { status: 500 });
  }

  let state: string;
  try {
    state = encodeOAuthState(clientId, accountId);
  } catch (err) {
    return new Response(err instanceof Error ? err.message : "Could not start the connection.", { status: 400 });
  }

  const origin = trustedOrigin(req.url);
  const redirectUri = `${origin}/api/admin/connect/gads/callback`;
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientIdEnv);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "https://www.googleapis.com/auth/adwords");
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("state", state);

  return Response.redirect(authUrl.toString());
}
