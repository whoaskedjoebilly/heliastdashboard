import { createHash, timingSafeEqual } from "node:crypto";

// Guards for the admin-only connect routes (dashboard-live-setup.md Phase 6).
// These routes are never linked from the client dashboard — you navigate to
// them directly. Protection is a shared secret rather than a full session
// check: set ADMIN_ACCESS_TOKEN in Vercel and send it as the `x-admin-token`
// header (preferred) or as ?token=... when you visit /api/admin/connect/*
// yourself. The query form is kept for browser navigation but leaks into
// logs/history, so prefer the header wherever a client can set one.

/** Constant-time string comparison. Hashing first makes both buffers the
 * same length so timingSafeEqual never throws and length isn't leaked. */
export function safeEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function isAdminRequest(req: Request): boolean {
  const configured = process.env.ADMIN_ACCESS_TOKEN;
  if (!configured) return false;
  const fromHeader = req.headers.get("x-admin-token");
  if (fromHeader && safeEqual(fromHeader, configured)) return true;
  const fromQuery = new URL(req.url).searchParams.get("token");
  return !!fromQuery && safeEqual(fromQuery, configured);
}

/** Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET
 * is set as an env var — see https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs */
export function isCronRequest(req: Request): boolean {
  const configured = process.env.CRON_SECRET;
  if (!configured) return false;
  return safeEqual(req.headers.get("authorization"), `Bearer ${configured}`);
}
