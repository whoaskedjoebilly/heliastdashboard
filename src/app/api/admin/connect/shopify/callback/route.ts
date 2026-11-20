import { createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/server";
import { logProviderFailure, noStoreResponse, readOAuthCallback } from "@/lib/oauth-callback";

// Step 2 of Shopify OAuth — verifies the request really came from Shopify
// (HMAC over the query params, per Shopify's install-request verification
// docs) before trusting the `shop` domain it names, then exchanges the code
// for a permanent Admin API access token. client_id comes from signed state.
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
  const shop = url.searchParams.get("shop");
  if (!shop || !SHOPIFY_SHOP_RE.test(shop)) {
    return noStoreResponse("Invalid shop domain in callback", 400);
  }

  const apiKey = process.env.SHOPIFY_API_KEY;
  const apiSecret = process.env.SHOPIFY_API_SECRET;
  if (!apiKey || !apiSecret) {
    return new Response("SHOPIFY_API_KEY / SHOPIFY_API_SECRET are not configured", { status: 500 });
  }
  if (!verifyShopifyHmac(url, apiSecret)) {
    return noStoreResponse("Invalid HMAC signature — this request didn't come from Shopify", 401);
  }

  const parsed = await readOAuthCallback(req);
  if (!parsed.ok) return parsed.response;
  const { origin, code, state } = parsed.value;
  if (state.accountId && state.accountId !== shop) {
    return noStoreResponse("Shop domain doesn't match the one this flow was started for", 400);
  }

  const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: apiKey, client_secret: apiSecret, code }),
  });
  if (!tokenRes.ok) return logProviderFailure(tokenRes, "Failed to exchange the authorization code");
  const { access_token } = (await tokenRes.json()) as { access_token: string };

  // Shopify's offline access tokens (this flow) don't expire and have no
  // refresh token — re-running the connect flow is how you'd rotate one.
  const { error } = await supabaseAdmin!.from("dashboard_client_integrations").upsert(
    {
      client_id: state.clientId,
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
    console.error("Failed to store shopify integration", error.message);
    return new Response("Failed to store the connection.", { status: 500 });
  }

  return Response.redirect(`${origin}/?connected=shopify`);
}
