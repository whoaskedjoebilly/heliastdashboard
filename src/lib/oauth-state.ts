import { createHmac, timingSafeEqual } from "node:crypto";

// Packs { clientId, accountId, ... } into the OAuth `state` param so it
// survives the round trip to the provider and back — providers only echo
// `state` back verbatim, never any other query param we sent.
//
// The state is HMAC-signed and expires after 15 minutes. The callback routes
// are public (the provider redirects the browser to them), so without a
// signature anyone could craft a state naming ANY client_id and attach their
// own Google/Meta/TikTok account to that client's dashboard. Only a state we
// issued (from an admin-authenticated connect route) verifies.
//
// igAccountId/pageId are only used by the Meta flow, which needs to carry
// the Instagram business account and Facebook Page IDs through the round
// trip too so the callback can create "instagram"/"facebook" integration
// rows alongside "meta_ads" in one pass — every other caller just omits
// them and gets null back.
const STATE_TTL_MS = 15 * 60 * 1000;

function secret(): string | null {
  return process.env.OAUTH_STATE_SECRET || process.env.ADMIN_ACCESS_TOKEN || null;
}

function sign(payload: string, key: string): string {
  return createHmac("sha256", key).update(payload).digest("base64url");
}

export function encodeOAuthState(
  clientId: string,
  accountId: string | null,
  extra?: { igAccountId?: string | null; pageId?: string | null }
): string {
  const key = secret();
  if (!key) throw new Error("ADMIN_ACCESS_TOKEN (or OAUTH_STATE_SECRET) must be set to sign OAuth state");
  const payload = Buffer.from(
    JSON.stringify({
      clientId,
      accountId,
      igAccountId: extra?.igAccountId ?? null,
      pageId: extra?.pageId ?? null,
      exp: Date.now() + STATE_TTL_MS,
    })
  ).toString("base64url");
  return `${payload}.${sign(payload, key)}`;
}

export function decodeOAuthState(
  state: string | null
): { clientId: string; accountId: string | null; igAccountId: string | null; pageId: string | null } | null {
  if (!state) return null;
  const key = secret();
  if (!key) return null;
  const [payload, sig, ...rest] = state.split(".");
  if (!payload || !sig || rest.length) return null;
  const expected = sign(payload, key);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
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
