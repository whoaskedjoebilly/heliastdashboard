import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { isAdminRequest, isCronRequest } from "../src/lib/admin-auth.ts";
import { decodeOAuthState, encodeOAuthState } from "../src/lib/oauth-state.ts";
import { rateLimit } from "../src/lib/rate-limit.ts";
import { trustedOrigin } from "../src/lib/request-origin.ts";
import { securityHeaders } from "../src/lib/security-headers.ts";

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";

test("oauth state round-trips and rejects tampering, expiry, and unsigned payloads", () => {
  process.env.OAUTH_STATE_SECRET = "test-state-secret-value";
  const encoded = encodeOAuthState(CLIENT_ID, "https://example.com/", { igAccountId: null, pageId: "123" });
  const decoded = decodeOAuthState(encoded);
  assert.equal(decoded?.clientId, CLIENT_ID);
  assert.equal(decoded?.accountId, "https://example.com/");
  assert.equal(decoded?.pageId, "123");

  const [body, signature] = encoded.split(".");
  assert.ok(body && signature);
  const flipped = `${body.slice(0, -1)}${body.endsWith("a") ? "b" : "a"}.${signature}`;
  assert.equal(decodeOAuthState(flipped), null);

  const expiredBody = Buffer.from(
    JSON.stringify({
      clientId: CLIENT_ID,
      accountId: null,
      igAccountId: null,
      pageId: null,
      exp: Date.now() - 1000,
    })
  ).toString("base64url");
  const expiredSig = createHmac("sha256", process.env.OAUTH_STATE_SECRET).update(expiredBody).digest("base64url");
  assert.equal(decodeOAuthState(`${expiredBody}.${expiredSig}`), null);

  const unsigned = Buffer.from(JSON.stringify({ clientId: CLIENT_ID, accountId: null })).toString("base64url");
  assert.equal(decodeOAuthState(unsigned), null);
  assert.throws(() => encodeOAuthState("not-a-uuid", null));
  assert.throws(() => encodeOAuthState(CLIENT_ID, "https://evil.example/@attacker"));
});

test("admin and cron secrets compare in constant time and ignore a wrong length", () => {
  process.env.ADMIN_ACCESS_TOKEN = "admin-token-value-1";
  process.env.CRON_SECRET = "cron-token-value-01";
  const admin = new Request("https://www.heliastdashboard.com/api/admin/connect/gsc?token=admin-token-value-1");
  assert.equal(isAdminRequest(admin), true);
  assert.equal(isAdminRequest(new Request("https://www.heliastdashboard.com/api/admin/connect/gsc?token=admin-token-value-2")), false);
  assert.equal(
    isAdminRequest(new Request("https://www.heliastdashboard.com/api/admin/connect/gsc", { headers: { "x-admin-token": "admin-token-value-1" } })),
    true
  );
  assert.equal(isAdminRequest(new Request("https://www.heliastdashboard.com/api/admin/connect/gsc?token=short")), false);

  const cron = new Request("https://www.heliastdashboard.com/api/cron/sync", {
    headers: { authorization: "Bearer cron-token-value-01" },
  });
  assert.equal(isCronRequest(cron), true);
  assert.equal(
    isCronRequest(new Request("https://www.heliastdashboard.com/api/cron/sync", { headers: { authorization: "Bearer cron-token-value-02" } })),
    false
  );
  delete process.env.ADMIN_ACCESS_TOKEN;
  assert.equal(isAdminRequest(admin), false);
});

test("trusted origin does not reflect an arbitrary host", () => {
  delete process.env.NEXT_PUBLIC_SITE_URL;
  assert.equal(trustedOrigin("https://www.heliastdashboard.com/api/admin/connect/gsc"), "https://www.heliastdashboard.com");
  assert.equal(trustedOrigin("https://evil.example/api/admin/connect/gsc/callback"), "https://www.heliastdashboard.com");
  assert.equal(trustedOrigin("http://localhost:3000/api/admin/connect/gsc"), "http://localhost:3000");
  assert.equal(trustedOrigin("https://heliastdashboard-git-preview.vercel.app/"), "https://heliastdashboard-git-preview.vercel.app");
});

test("security headers cover the required set and lock framing", () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  const headers = Object.fromEntries(securityHeaders().map((header) => [header.key, header.value]));
  assert.match(headers["Content-Security-Policy"], /frame-ancestors 'none'/);
  assert.doesNotMatch(headers["Content-Security-Policy"], /unsafe-eval/);
  assert.equal(headers["X-Frame-Options"], "DENY");
  assert.equal(headers["X-Content-Type-Options"], "nosniff");
  assert.equal(headers["Referrer-Policy"], "strict-origin-when-cross-origin");
  assert.match(headers["Permissions-Policy"], /camera=\(\)/);
  assert.match(headers["Permissions-Policy"], /microphone=\(\)/);
  assert.match(headers["Permissions-Policy"], /geolocation=\(\)/);
  assert.equal(headers["Strict-Transport-Security"], "max-age=63072000");
  process.env.NODE_ENV = previous;
});

test("rate limit blocks the request after the budget is spent", () => {
  const key = `test-${Date.now()}-${Math.random()}`;
  assert.equal(rateLimit(key, 2, 60_000).ok, true);
  assert.equal(rateLimit(key, 2, 60_000).ok, true);
  const blocked = rateLimit(key, 2, 60_000);
  assert.equal(blocked.ok, false);
  assert.ok(blocked.retryAfterSec >= 1);
});
