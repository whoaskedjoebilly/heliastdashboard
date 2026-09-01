import { isAdminRequest } from "@/lib/admin-auth";
import { encodeOAuthState } from "@/lib/oauth-state";

// Step 1 of Meta OAuth (dashboard-live-setup.md Phase 6). One Meta app
// covers Meta Ads, Instagram, and Facebook Page data — the resulting token
// is stored once under platform "meta_ads" and reused by the sync job
// (Phase 7) for the instagram/facebook pulls too.
// Visit directly: /api/admin/connect/meta?client_id=<uuid>&account_id=<ad-account-id>&token=<ADMIN_ACCESS_TOKEN>
// account_id is the Meta ad account ID (e.g. act_1234567890).
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

  const appId = process.env.META_APP_ID;
  if (!appId) {
    return new Response("META_APP_ID is not configured", { status: 500 });
  }

  const redirectUri = `${url.origin}/api/admin/connect/meta/callback`;
  const authUrl = new URL("https://www.facebook.com/v19.0/dialog/oauth");
  authUrl.searchParams.set("client_id", appId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "ads_read,instagram_basic,instagram_manage_insights,pages_read_engagement");
  authUrl.searchParams.set("state", encodeOAuthState(clientId, accountId));

  return Response.redirect(authUrl.toString());
}
