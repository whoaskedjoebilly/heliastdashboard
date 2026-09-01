// Live visitor tracking pixel (dashboard-live-setup.md Phase 9, Option B).
// Public/anonymous endpoint — the marketing site POSTs here on every page
// view. Validates client_id against dashboard_clients (rejecting junk), then
// inserts into dashboard_live_visitors and prunes anything older than 2
// minutes so "who's on the site right now" stays accurate without a
// separate cleanup job.
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  let body: { client_id?: string; page?: string; location?: string; lat?: number; lng?: number; device?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const { client_id, page, location, lat, lng, device } = body;
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!client_id || !uuidPattern.test(client_id) || !page) {
    return new Response(JSON.stringify({ error: "client_id (uuid) and page are required" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: client } = await supabase.from("dashboard_clients").select("id").eq("id", client_id).maybeSingle();
  if (!client) {
    return new Response(JSON.stringify({ error: "Unknown client_id" }), {
      status: 404,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const { error: insertError } = await supabase.from("dashboard_live_visitors").insert({
    client_id,
    page,
    location: location ?? null,
    lat: lat ?? null,
    lng: lng ?? null,
    device: device ?? null,
  });
  if (insertError) {
    return new Response(JSON.stringify({ error: insertError.message }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  await supabase.from("dashboard_live_visitors").delete().eq("client_id", client_id).lt("entered_at", twoMinutesAgo);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
});
