import { isAdminRequest } from "@/lib/admin-auth";
import { isUuid } from "@/lib/uuid";
import { supabaseAdmin } from "@/lib/supabase/server";

// Simpler alternative to /api/admin/connect/shopify for the common case of
// connecting ONE specific store you already manage yourself, rather than
// onboarding an unaffiliated client's store through a Shopify Partner app.
// A "custom app" created from inside that store's own Admin hands you a
// permanent Admin API access token directly.
//
// POST JSON so the Shopify token never sits in a URL, access log, or
// browser history:
//   curl -X POST -H "x-admin-token: $ADMIN_ACCESS_TOKEN" \
//     -H "content-type: application/json" \
//     -d '{"client_id":"<uuid>","shop":"<store>.myshopify.com","access_token":"shpat_..."}' \
//     https://www.heliastdashboard.com/api/admin/connect/shopify-token
const SHOPIFY_SHOP_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;

export async function GET() {
  return new Response(
    "Use POST with JSON { client_id, shop, access_token } and the x-admin-token header. The Shopify access token is not accepted on the query string.",
    { status: 405, headers: { Allow: "POST", "Cache-Control": "private, no-store" } }
  );
}

export async function POST(req: Request) {
  if (!isAdminRequest(req)) {
    return new Response("Not authorized", { status: 401, headers: { "Cache-Control": "private, no-store" } });
  }

  let body: { client_id?: unknown; shop?: unknown; access_token?: unknown };
  try {
    body = (await req.json()) as { client_id?: unknown; shop?: unknown; access_token?: unknown };
  } catch {
    return new Response("Expected a JSON body.", { status: 400, headers: { "Cache-Control": "private, no-store" } });
  }

  const clientId = typeof body.client_id === "string" ? body.client_id : "";
  if (!isUuid(clientId)) {
    return new Response("client_id must be a UUID", { status: 400 });
  }
  const shop = typeof body.shop === "string" ? body.shop : "";
  if (!SHOPIFY_SHOP_RE.test(shop)) {
    return new Response("Invalid shop — expected something like your-store.myshopify.com", { status: 400 });
  }
  const accessToken = typeof body.access_token === "string" ? body.access_token : "";
  if (accessToken.length < 10 || accessToken.length > 500) {
    return new Response("Missing access_token — the Admin API access token shown when you install the custom app", { status: 400 });
  }
  if (!supabaseAdmin) {
    return new Response("SUPABASE_SERVICE_ROLE_KEY is not configured", { status: 500 });
  }

  const { data: client, error: clientError } = await supabaseAdmin
    .from("dashboard_clients")
    .select("id")
    .eq("id", clientId)
    .maybeSingle();
  if (clientError || !client) {
    return new Response("Unknown client.", { status: 400 });
  }

  // Confirm the token actually works before storing it, rather than saving
  // something broken that only fails silently in tomorrow's sync job.
  const check = await fetch(`https://${shop}/admin/api/2024-10/shop.json`, {
    headers: { "X-Shopify-Access-Token": accessToken },
  });
  if (!check.ok) {
    console.error("Shopify token check failed", shop, check.status, (await check.text()).slice(0, 500));
    return new Response("Shopify rejected this access token for that shop.", { status: 400 });
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
    console.error("Failed to store shopify token integration", error.message);
    return new Response("Failed to store the connection.", { status: 500 });
  }

  return Response.json({ ok: true, connected: "shopify" }, { headers: { "Cache-Control": "private, no-store" } });
}
