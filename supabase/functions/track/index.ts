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

// The tracking snippet only sends lat/lng when the visitor's browser grants
// the geolocation permission prompt — most people decline it, so relying on
// that alone left the globe almost always empty. Fall back to a free IP
// geolocation lookup (no permission needed) whenever the client didn't send
// coordinates, using the visitor's IP from the forwarding headers Deno
// Deploy/Supabase populate on every request.
async function geolocateIp(ip: string | null): Promise<{ location: string | null; lat: number | null; lng: number | null }> {
  const empty = { location: null, lat: null, lng: null };
  if (!ip || ip === "127.0.0.1" || ip === "::1" || ip.startsWith("10.") || ip.startsWith("192.168.")) {
    return empty;
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`https://ipwho.is/${ip}`, { signal: controller.signal });
    clearTimeout(timeout);
    const data = await res.json();
    if (!data.success) return empty;
    const parts = [data.city, data.country].filter(Boolean);
    return {
      location: parts.length ? parts.join(", ") : null,
      lat: typeof data.latitude === "number" ? data.latitude : null,
      lng: typeof data.longitude === "number" ? data.longitude : null,
    };
  } catch {
    return empty;
  }
}

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
  // Public endpoint: validate type AND size of every field so a caller can't
  // stuff arbitrary data into the database.
  const okStr = (v: unknown, max: number) => typeof v === "string" && v.length <= max;
  const okNum = (v: unknown, lo: number, hi: number) => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
  if (
    typeof client_id !== "string" ||
    !uuidPattern.test(client_id) ||
    !okStr(page, 500) ||
    !page ||
    (location != null && !okStr(location, 120)) ||
    (device != null && !okStr(device, 40)) ||
    (lat != null && !okNum(lat, -90, 90)) ||
    (lng != null && !okNum(lng, -180, 180))
  ) {
    return new Response(JSON.stringify({ error: "Invalid payload" }), {
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

  // Flood guard: a single client can't have more than 600 live-visitor rows
  // in the 2-minute window — beyond that, drop silently instead of writing.
  const windowStart = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("dashboard_live_visitors")
    .select("id", { count: "exact", head: true })
    .eq("client_id", client_id)
    .gte("entered_at", windowStart);
  if ((count ?? 0) >= 600) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  let finalLocation = location ?? null;
  let finalLat = lat ?? null;
  let finalLng = lng ?? null;
  if (finalLat == null || finalLng == null) {
    const forwardedFor = req.headers.get("x-forwarded-for");
    const ip = forwardedFor ? forwardedFor.split(",")[0].trim() : req.headers.get("x-real-ip");
    const geo = await geolocateIp(ip);
    finalLocation = finalLocation ?? geo.location;
    finalLat = finalLat ?? geo.lat;
    finalLng = finalLng ?? geo.lng;
  }

  const { error: insertError } = await supabase.from("dashboard_live_visitors").insert({
    client_id,
    page,
    location: finalLocation,
    lat: finalLat,
    lng: finalLng,
    device: device ?? null,
  });
  if (insertError) {
    console.error("track insert failed:", insertError.message);
    return new Response(JSON.stringify({ error: "Could not record visit" }), {
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
