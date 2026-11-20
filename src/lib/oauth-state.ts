import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Packs { clientId, accountId, ... } into the OAuth `state` param so it
// survives the round trip to the provider and back — providers only echo
// `state` back verbatim, never any other query param we sent.
//
// The state is HMAC-SHA256 signed and expires after 10 minutes. The OAuth
// callbacks are reachable without an admin token (the provider redirects the
// browser there), so without a signature anyone could forge a state naming
// any clientId and overwrite that client's stored integration tokens.
//
// Signing key: OAUTH_STATE_SECRET if set, otherwise derived from
// ADMIN_ACCESS_TOKEN. If neither exists, encode throws and decode returns null.
//
// igAccountId/pageId are only used by the Meta flow, which needs to carry
// the Instagram business account and Facebook Page IDs through the round
// trip too so the callback can create "instagram"/"facebook" integration
// rows alongside "meta_ads" in one pass — every other caller just omits
// them and gets null back.

const STATE_TTL_MS = 10 * 60 * 1000;

function signingKey(): string | null {
  const secret = process.env.OAUTH_STATE_SECRET || process.env.ADMIN_ACCESS_TOKEN;
  if (!secret) return null;
  return createHmac("sha256", secret).update("heliast-oauth-state-v1").digest("hex");
}

function sign(payload: string, key: string): Buffer {
  return createHmac("sha256", key).update(payload).digest();
}

export function encodeOAuthState(
  clientId: string,
  accountId: string | null,
  extra?: { igAccountId?: string | null; pageId?: string | null }
): string {
  const key = signingKey();
  if (!key) throw new Error("OAUTH_STATE_SECRET or ADMIN_ACCESS_TOKEN must be set to sign OAuth state");
  const payload = Buffer.from(
    JSON.stringify({
      clientId,
      accountId,
      igAccountId: extra?.igAccountId ?? null,
      pageId: extra?.pageId ?? null,
      exp: Date.now() + STATE_TTL_MS,
      nonce: randomBytes(12).toString("base64url"),
    })
  ).toString("base64url");
  return `${payload}.${sign(payload, key).toString("base64url")}`;
}

export function decodeOAuthState(
  state: string | null
): { clientId: string; accountId: string | null; igAccountId: string | null; pageId: string | null } | null {
  if (!state || state.length > 2048) return null;
  const key = signingKey();
  if (!key) return null;
  try {
    const [payload, sig, ...rest] = state.split(".");
    if (!payload || !sig || rest.length) return null;
    const given = Buffer.from(sig, "base64url");
    const expected = sign(payload, key);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof parsed.clientId !== "string") return null;
    if (typeof parsed.exp !== "number" || parsed.exp < Date.now()) return null;
    return {
      clientId: parsed.clientId,
      accountId: typeof parsed.accountId === "string" ? parsed.accountId : null,
      igAccountId: typeof parsed.igAccountId === "string" ? parsed.igAccountId : null,
      pageId: typeof parsed.pageId === "string" ? parsed.pageId : null,
    };
  } catch {
    return null;
  }
}
