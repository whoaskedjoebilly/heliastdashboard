import { isAdminRequest } from "@/lib/admin-auth";

import { encodeOAuthState } from "@/lib/oauth-state";

// Step 1 of Google Search Console OAuth (dashboard-live-setup.md Phase 6).
// Never linked from the client dashboard — visit directly as an admin:
// /api/admin/connect/gsc?client_id=<uuid>&account_id=<site-url>&token=<ADMIN_ACCESS_TOKEN>
// account_id here is the GSC-verified site URL (e.g. https://example.com/ or sc-domain:example.com).
export async function GET(req: Request) {
  if (!isAdminRequest(req)) {
    return new Response("Not authorized", { status: 401 });
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

  const redirectUri = `${url.origin}/api/admin/connect/gsc/callback`;
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientIdEnv);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "https://www.googleapis.com/auth/webmasters.readonly");
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("state", encodeOAuthState(clientId, accountId));

  return Response.redirect(authUrl.toString());
}
