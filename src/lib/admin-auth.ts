// Guards for the admin-only connect routes (dashboard-live-setup.md Phase 6).
// These routes are never linked from the client dashboard — you navigate to
// them directly. Protection is a shared secret rather than a full session
// check: set ADMIN_ACCESS_TOKEN in Vercel and pass it as ?token=... when you
// visit /api/admin/connect/* yourself.
export function isAdminRequest(req: Request): boolean {
  const configured = process.env.ADMIN_ACCESS_TOKEN;
  if (!configured) return false;
  const url = new URL(req.url);
  const fromQuery = url.searchParams.get("token");
  const fromHeader = req.headers.get("x-admin-token");
  return fromQuery === configured || fromHeader === configured;
}

/** Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET
 * is set as an env var — see https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs */
export function isCronRequest(req: Request): boolean {
  const configured = process.env.CRON_SECRET;
  if (!configured) return false;
  return req.headers.get("authorization") === `Bearer ${configured}`;
}
