import { createHmac, timingSafeEqual } from "crypto";
import { isUuid } from "./uuid";

// OAuth `state` is echoed back by the provider. It used to be unsigned
// base64 JSON, so anyone who knew a dashboard client UUID could finish a
// callback and overwrite that client's stored tokens. The value is now
// HMAC-SHA256 signed and expires after 15 minutes. Callbacks reject
// anything that does not verify.

const STATE_TTL_MS = 15 * 60 * 1000;
const MAX_ACCOUNT_ID_LENGTH = 300;

export interface OAuthStatePayload {
  clientId: string;
  accountId: string | null;
  igAccountId: string | null;
  pageId: string | null;
}

function stateSecret(): string | null {
  const value = process.env.OAUTH_STATE_SECRET || process.env.ADMIN_ACCESS_TOKEN || "";
  if (value.length < 16) return null;
  return value;
}

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function cleanAccountId(value: string | null | undefined, label: string): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > MAX_ACCOUNT_ID_LENGTH) {
    throw new Error(`${label} is too long`);
  }
  // Keep provider ids and site URLs, but refuse path tricks and header
  // injection before this value is stored and later placed in an outbound URL.
  if (/[\u0000-\u001f\u007f]/.test(trimmed) || trimmed.includes("..") || trimmed.includes("@") || trimmed.includes("\\")) {
    throw new Error(`${label} contains unsupported characters`);
  }
  return trimmed;
}

export function encodeOAuthState(
  clientId: string,
  accountId: string | null,
  extra?: { igAccountId?: string | null; pageId?: string | null }
): string {
  const secret = stateSecret();
  if (!secret) {
    throw new Error("Set OAUTH_STATE_SECRET or ADMIN_ACCESS_TOKEN to a value of at least 16 characters before starting a connect flow.");
  }
  if (!isUuid(clientId)) {
    throw new Error("client_id must be a UUID");
  }
  const payload = {
    clientId,
    accountId: cleanAccountId(accountId, "account_id"),
    igAccountId: cleanAccountId(extra?.igAccountId, "ig_account_id"),
    pageId: cleanAccountId(extra?.pageId, "page_id"),
    exp: Date.now() + STATE_TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body, secret)}`;
}

export function decodeOAuthState(state: string | null): OAuthStatePayload | null {
  const secret = stateSecret();
  if (!state || !secret) return null;
  const dot = state.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = state.slice(0, dot);
  const signature = state.slice(dot + 1);
  const expected = sign(body, secret);
  if (!safeEqual(signature, expected)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as {
      clientId?: unknown;
      accountId?: unknown;
      igAccountId?: unknown;
      pageId?: unknown;
      exp?: unknown;
    };
    if (typeof parsed.clientId !== "string" || !isUuid(parsed.clientId)) return null;
    if (typeof parsed.exp !== "number" || !Number.isFinite(parsed.exp) || parsed.exp < Date.now()) return null;
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
