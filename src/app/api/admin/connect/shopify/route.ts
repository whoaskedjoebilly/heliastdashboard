import { isAdminRequest } from "@/lib/admin-auth";
import { encodeOAuthState } from "@/lib/oauth-state";

// Step 1 of Shopify OAuth. Unlike the Google/Meta/TikTok flows, Shopify's
// authorize URL lives on the SHOP's own domain (not a shared provider
// endpoint) — the shop parameter is client-supplied, so it's validated
// against Shopify's own domain shape before being used to build a redirect
// URL, to avoid this route being usable as an open redirect to an arbitrary
// host.
// Visit directly:
// /api/admin/connect/shopify?client_id=<uuid>&shop=<store>.myshopify.com&token=<ADMIN_ACCESS_TOKEN>
const SHOPIFY_SHOP_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;

export async function GET(req: Request) {
  if (!isAdminRequest(req)) {
    return new Response("Not authorized", { status: 401 });
  }

  const url = new URL(req.url);
  const clientId = url.searchParams.get("client_id");
  if (!clientId) {
    return new Response("Missing client_id query param", { status: 400 });
  }
  const shop = url.searchParams.get("shop");
  if (!shop || !SHOPIFY_SHOP_RE.test(shop)) {
    return new Response("Missing or invalid shop query param — expected something like your-store.myshopify.com", { status: 400 });
  }

  const apiKey = process.env.SHOPIFY_API_KEY;
  if (!apiKey) {
    return new Response("SHOPIFY_API_KEY is not configured", { status: 500 });
  }

  const redirectUri = `${url.origin}/api/admin/connect/shopify/callback`;
  const authUrl = new URL(`https://${shop}/admin/oauth/authorize`);
  authUrl.searchParams.set("client_id", apiKey);
  authUrl.searchParams.set("scope", "read_orders");
  authUrl.searchParams.set("redirect_uri", redirectUri);
  // The shop domain rides in `state` (as accountId) so the callback knows
  // which shop the returned code belongs to without trusting a client-
  // supplied `shop` param there too — it's re-validated against Shopify's
  // own `shop` param and HMAC signature on the way back regardless.
  authUrl.searchParams.set("state", encodeOAuthState(clientId, shop));

  return Response.redirect(authUrl.toString());
}
