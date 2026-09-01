import { isAdminRequest } from "@/lib/admin-auth";
import { encodeOAuthState } from "@/lib/oauth-state";

// Step 1 of TikTok OAuth (dashboard-live-setup.md Phase 6).
// Visit directly: /api/admin/connect/tiktok?client_id=<uuid>&account_id=<advertiser-id>&token=<ADMIN_ACCESS_TOKEN>
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

  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  if (!clientKey) {
    return new Response("TIKTOK_CLIENT_KEY is not configured", { status: 500 });
  }

  const redirectUri = `${url.origin}/api/admin/connect/tiktok/callback`;
  const authUrl = new URL("https://www.tiktok.com/v2/auth/authorize");
  authUrl.searchParams.set("client_key", clientKey);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "user.info.basic,video.list");
  authUrl.searchParams.set("state", encodeOAuthState(clientId, accountId));

  return Response.redirect(authUrl.toString());
}
