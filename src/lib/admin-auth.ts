import { timingSafeEqual } from "crypto";

// Guards for the admin-only connect routes. These routes are never linked
// from the client dashboard — an admin opens them directly. Protection is
// a shared secret: set ADMIN_ACCESS_TOKEN and pass it as the x-admin-token
// header, or as ?token= when the visit is a browser navigation (a browser
// cannot set a custom header on a top-level GET). Query tokens land in
// access logs and history; prefer the header, and never put a third-party
// access token in the query string (see the Shopify token route).

const MAX_SECRET_LENGTH = 256;

function safeEqual(provided: string | null, expected: string): boolean {
  if (!provided || provided.length > MAX_SECRET_LENGTH || expected.length > MAX_SECRET_LENGTH) return false;
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function isAdminRequest(req: Request): boolean {
  const configured = process.env.ADMIN_ACCESS_TOKEN;
  if (!configured) return false;
  const url = new URL(req.url);
  const fromQuery = url.searchParams.get("token");
  const fromHeader = req.headers.get("x-admin-token");
  return safeEqual(fromQuery, configured) || safeEqual(fromHeader, configured);
}

/** Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET
 * is set as an env var — see https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs */
export function isCronRequest(req: Request): boolean {
  const configured = process.env.CRON_SECRET;
  if (!configured) return false;
  const header = req.headers.get("authorization");
  const provided = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
  return safeEqual(provided, configured);
}
