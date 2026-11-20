import { isAdminHeaderRequest } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase/server";

// Simpler alternative to /api/admin/connect/shopify for the common case of
// connecting ONE specific store you already manage yourself. A "custom app"
// created from inside that store's own Admin hands you a permanent Admin API
// access token directly.
//
// POST only, with the admin token in the x-admin-token header and the Shopify
// token in the JSON body — secrets never go in a URL (URLs end up in browser
// history, proxy and server logs).
//
//   curl -X POST https://<dashboard>/api/admin/connect/shopify-token \
//     -H "x-admin-token: $ADMIN_ACCESS_TOKEN" -H "content-type: application/json" \
//     -d '{"client_id":"<uuid>","shop":"<store>.myshopify.com","access_token":"shpat_..."}'
const SHOPIFY_SHOP_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  if (!isAdminHeaderRequest(req)) {
    return new Response("Not authorized", { status: 401 });
  }

  let body: { client_id?: unknown; shop?: unknown; access_token?: unknown };
  try {
    body = await req.json();
  } catch {
    return new Response("Body must be JSON", { status: 400 });
  }

  const clientId = typeof body.client_id === "string" ? body.client_id : "";
  const shop = typeof body.shop === "string" ? body.shop : "";
  const accessToken = typeof body.access_token === "string" ? body.access_token : "";
  if (!UUID_RE.test(clientId)) {
    return new Response("client_id must be a uuid", { status: 400 });
  }
  if (!SHOPIFY_SHOP_RE.test(shop)) {
    return new Response("shop must look like your-store.myshopify.com", { status: 400 });
  }
  if (!accessToken || accessToken.length > 200) {
    return new Response("access_token missing or too long", { status: 400 });
  }
  if (!supabaseAdmin) {
    return new Response("Server is not configured", { status: 500 });
  }

  // Confirm the token actually works before storing it, rather than saving
  // something broken that only fails silently in tomorrow's sync job.
  const check = await fetch(`https://${shop}/admin/api/2024-10/shop.json`, {
    headers: { "X-Shopify-Access-Token": accessToken },
  });
  if (!check.ok) {
    return new Response(`Shopify rejected this access token for ${shop} (HTTP ${check.status})`, { status: 400 });
  }

  const { error } = await supabaseAdmin.from("dashboard_client_integrations").upsert(
    {
      client_id: clientId,
      platform: "shopify",
      access_token: accessToken,
      refresh_token: null,
      expires_at: null,
      connected_at: new Date().toISOString(),
      external_account_id: shop,
    },
    { onConflict: "client_id,platform" }
  );
  if (error) {
    console.error("shopify-token upsert failed:", error.message);
    return new Response("Failed to store integration", { status: 500 });
  }

  return Response.json({ ok: true, platform: "shopify", shop });
}
