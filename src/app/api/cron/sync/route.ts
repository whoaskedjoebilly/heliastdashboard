import { supabaseAdmin } from "@/lib/supabase/server";
import { isCronRequest } from "@/lib/admin-auth";
import { syncGa4, syncGoogleAds, syncGsc, syncMetaAds, syncMetaPageStats, syncTiktok, type IntegrationRow } from "@/lib/sync/providers";

// Daily sync job (dashboard-live-setup.md Phase 7) — configured to run via
// vercel.json's cron schedule. Vercel calls this with
// `Authorization: Bearer $CRON_SECRET` automatically when CRON_SECRET is
// set as an env var; reject anything else so this can't be triggered by
// just anyone hitting the URL.
export async function GET(req: Request) {
  if (!isCronRequest(req)) {
    return new Response("Not authorized", { status: 401 });
  }
  if (!supabaseAdmin) {
    return new Response("SUPABASE_SERVICE_ROLE_KEY is not configured", { status: 500 });
  }

  const { data: integrations, error } = await supabaseAdmin
    .from("dashboard_client_integrations")
    .select("client_id, platform, access_token, refresh_token, expires_at, external_account_id");

  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  const results: { client_id: string; platform: string; ok: boolean; error?: string }[] = [];

  for (const integration of (integrations ?? []) as IntegrationRow[]) {
    try {
      switch (integration.platform) {
        case "gsc":
          await syncGsc(integration, supabaseAdmin);
          break;
        case "ga4":
          await syncGa4(integration, supabaseAdmin);
          break;
        case "gads":
          await syncGoogleAds(integration, supabaseAdmin);
          break;
        case "meta_ads":
          await syncMetaAds(integration, supabaseAdmin);
          break;
        case "instagram":
        case "facebook":
          await syncMetaPageStats(integration, supabaseAdmin);
          break;
        case "tiktok":
          await syncTiktok(integration, supabaseAdmin);
          break;
        default:
          throw new Error(`Unknown platform: ${integration.platform}`);
      }
      results.push({ client_id: integration.client_id, platform: integration.platform, ok: true });
    } catch (err) {
      // One integration failing (expired token, API error) shouldn't stop
      // the rest of the run.
      results.push({
        client_id: integration.client_id,
        platform: integration.platform,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return Response.json({ ok: true, synced: results.length, results });
}
