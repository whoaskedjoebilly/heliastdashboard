import { timingSafeEqual, createHash } from "node:crypto";

// Guards for the admin-only routes.
//
// Compared in constant time (hashing first so lengths always match) so the
// secret can't be recovered by timing a long run of guesses.
function safeEqual(a: string | null, b: string | undefined): boolean {
  if (!a || !b) return false;
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/**
 * Admin check for routes an admin opens in a browser (the OAuth "connect"
 * links), where a header can't be set — accepts ?token= OR x-admin-token.
 * A token in a URL lands in browser history and server logs, so rotate
 * ADMIN_ACCESS_TOKEN periodically. Never use this for routes that take
 * other secrets in the request (see isAdminHeaderRequest).
 */
export function isAdminRequest(req: Request): boolean {
  const configured = process.env.ADMIN_ACCESS_TOKEN;
  if (!configured) return false;
  const url = new URL(req.url);
  return safeEqual(url.searchParams.get("token"), configured) || safeEqual(req.headers.get("x-admin-token"), configured);
}

/** Header-only admin check — the token is never accepted from the URL. */
export function isAdminHeaderRequest(req: Request): boolean {
  const configured = process.env.ADMIN_ACCESS_TOKEN;
  if (!configured) return false;
  return safeEqual(req.headers.get("x-admin-token"), configured);
}

/** Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET
 * is set as an env var — see https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs */
export function isCronRequest(req: Request): boolean {
  const configured = process.env.CRON_SECRET;
  if (!configured) return false;
  const header = req.headers.get("authorization");
  return safeEqual(header, `Bearer ${configured}`);
}
