import { createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/server";
import { decodeOAuthState } from "@/lib/oauth-state";

// Step 2 of Shopify OAuth — verifies the request really came from Shopify
// (HMAC over the query params, per Shopify's install-request verification
// docs) before trusting the `shop` domain it names, then exchanges the code
// for a permanent Admin API access token.
const SHOPIFY_SHOP_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;

function verifyShopifyHmac(url: URL, secret: string): boolean {
  const hmac = url.searchParams.get("hmac");
  if (!hmac) return false;
  const message = Array.from(url.searchParams.entries())
    .filter(([key]) => key !== "hmac" && key !== "signature")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  const digest = createHmac("sha256", secret).update(message).digest("hex");
  const a = Buffer.from(digest, "utf8");
  const b = Buffer.from(hmac, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const shop = url.searchParams.get("shop");
  const state = decodeOAuthState(url.searchParams.get("state"));
  const clientId = state?.clientId ?? null;

  if (!code || !shop || !clientId) {
    return new Response("Missing code, shop, or state (client_id) in callback", { status: 400 });
  }
  if (!SHOPIFY_SHOP_RE.test(shop)) {
    return new Response("Invalid shop domain in callback", { status: 400 });
  }
  if (state?.accountId && state.accountId !== shop) {
    return new Response("Shop domain doesn't match the one this flow was started for", { status: 400 });
  }
  if (!supabaseAdmin) {
    return new Response("SUPABASE_SERVICE_ROLE_KEY is not configured", { status: 500 });
  }

  const apiKey = process.env.SHOPIFY_API_KEY;
  const apiSecret = process.env.SHOPIFY_API_SECRET;
  if (!apiKey || !apiSecret) {
    return new Response("SHOPIFY_API_KEY / SHOPIFY_API_SECRET are not configured", { status: 500 });
  }
  if (!verifyShopifyHmac(url, apiSecret)) {
    return new Response("Invalid HMAC signature — this request didn't come from Shopify", { status: 401 });
  }

  const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: apiKey, client_secret: apiSecret, code }),
  });
  if (!tokenRes.ok) {
    const detail = await tokenRes.text();
    return new Response(`Failed to exchange code for token: ${detail}`, { status: 502 });
  }
  const { access_token } = (await tokenRes.json()) as { access_token: string };

  // Shopify's offline access tokens (this flow) don't expire and have no
  // refresh token — re-running the connect flow is how you'd rotate one.
  const { error } = await supabaseAdmin.from("dashboard_client_integrations").upsert(
    {
      client_id: clientId,
      platform: "shopify",
      access_token,
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
