import { isAdminRequest } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase/server";

// Simpler alternative to /api/admin/connect/shopify for the common case of
// connecting ONE specific store you already manage yourself, rather than
// onboarding an unaffiliated client's store through a Shopify Partner app.
// A "custom app" created from inside that store's own Admin (Settings >
// Apps and sales channels > Develop apps) hands you a permanent Admin API
// access token directly — no Partner account, redirect URLs, client
// secret, or distribution/collaborator-access step required at all.
// Visit directly:
// /api/admin/connect/shopify-token?client_id=<uuid>&shop=<store>.myshopify.com&access_token=<shpat_...>&token=<ADMIN_ACCESS_TOKEN>
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
  const accessToken = url.searchParams.get("access_token");
  if (!accessToken) {
    return new Response("Missing access_token query param — the Admin API access token shown once when you install the custom app", {
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
    return new Response(`Shopify rejected this access token for ${shop}: ${await check.text()}`, { status: 400 });
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
    return new Response(`Failed to store integration: ${error.message}`, { status: 500 });
  }

  return Response.redirect(`${url.origin}/?connected=shopify`);
}
