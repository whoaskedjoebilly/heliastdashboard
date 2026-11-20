import { safeEqual } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase/server";

// Simpler alternative to /api/admin/connect/shopify for the common case of
// connecting ONE specific store you already manage yourself, rather than
// onboarding an unaffiliated client's store through a Shopify Partner app.
// A "custom app" created from inside that store's own Admin (Settings >
// Apps and sales channels > Develop apps) hands you a permanent Admin API
// access token directly — no Partner account, redirect URLs, client
// secret, or distribution/collaborator-access step required at all.
//
// The Admin API token is a long-lived secret, so it is accepted ONLY in a
// POST body (never the query string, which ends up in logs and history):
//   curl -X POST https://<dashboard>/api/admin/connect/shopify-token \
//     -H "x-admin-token: $ADMIN_ACCESS_TOKEN" -H "content-type: application/json" \
//     -d '{"client_id":"<uuid>","shop":"<store>.myshopify.com","access_token":"shpat_..."}'
const SHOPIFY_SHOP_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  // Header only here: a query-string token would defeat the point of POST.
  if (!safeEqual(req.headers.get("x-admin-token"), process.env.ADMIN_ACCESS_TOKEN)) {
    return new Response("Not authorized", { status: 401 });
  }

  let body: { client_id?: unknown; shop?: unknown; access_token?: unknown };
  try {
    body = await req.json();
  } catch {
    return new Response("Expected a JSON body", { status: 400 });
  }
  const clientId = typeof body.client_id === "string" ? body.client_id : null;
  if (!clientId || !UUID_RE.test(clientId)) {
    return new Response("Missing or invalid client_id (uuid)", { status: 400 });
  }
  const shop = typeof body.shop === "string" ? body.shop : null;
  if (!shop || !SHOPIFY_SHOP_RE.test(shop)) {
    return new Response("Missing or invalid shop — expected something like your-store.myshopify.com", { status: 400 });
  }
  const accessToken = typeof body.access_token === "string" ? body.access_token : null;
  if (!accessToken || accessToken.length > 200) {
    return new Response("Missing access_token — the Admin API access token shown once when you install the custom app", {
      status: 400,
    });
  }
  if (!supabaseAdmin) {
    return new Response("SUPABASE_SERVICE_ROLE_KEY is not configured", { status: 500 });
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

  return Response.json({ ok: true, connected: "shopify", shop });
}
