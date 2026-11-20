// Live visitor tracking pixel (dashboard-live-setup.md Phase 9, Option B).
// Public endpoint — a customer's site POSTs here on every page view.
// client_id is not authorization: the body must also include that client's
// tracking_key (dashboard_clients.tracking_key, shown on the Settings tab).
// Knowing only the UUID is not enough to write another customer's Live tab.
// Inserts go into dashboard_live_visitors, then anything older than 2
// minutes for that same client is pruned.
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
function timingSafeEqualString(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let mismatch = a.length === b.length ? 0 : 1;
  for (let i = 0; i < len; i++) {
    mismatch |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return mismatch === 0;
}

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/[\u0000-\u001f\u007f<>]/g, "").trim();
  if (!trimmed || trimmed.length > max) return null;
  return trimmed;
}

/** Only public IPs are sent to the geolocation service. Anything else,
 * including path characters, is ignored so the lookup URL cannot be steered. */
function publicIp(ip: string | null): string | null {
  if (!ip) return null;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (v4) {
    const parts = v4.slice(1).map(Number);
    if (parts.some((n) => n > 255)) return null;
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return null;
    if (a === 169 && b === 254) return null;
    if (a === 172 && b >= 16 && b <= 31) return null;
    if (a === 192 && b === 168) return null;
    if (a === 100 && b >= 64 && b <= 127) return null;
    return ip;
  }
  if (!/^[0-9a-f:]+$/i.test(ip) || !ip.includes(":")) return null;
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd")) return null;
  return ip;
}

async function geolocateIp(ip: string | null): Promise<{ location: string | null; lat: number | null; lng: number | null }> {
  const empty = { location: null, lat: null, lng: null };
  const safeIp = publicIp(ip);
  if (!safeIp) return empty;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`https://ipwho.is/${encodeURIComponent(safeIp)}`, { signal: controller.signal });
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

  let body: { client_id?: string; tracking_key?: string; page?: string; location?: string; lat?: number; lng?: number; device?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const client_id = body.client_id ?? "";
  const trackingKey = typeof body.tracking_key === "string" ? body.tracking_key : "";
  const page = cleanText(body.page, 200);
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  // Same response for a bad id, a missing key, and an unknown client so this
  // endpoint cannot be used to enumerate which UUIDs exist.
  const unauthorized = new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
  if (!uuidPattern.test(client_id) || trackingKey.length < 16 || trackingKey.length > 128 || !page) {
    return unauthorized;
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: client, error: clientError } = await supabase
    .from("dashboard_clients")
    .select("id, tracking_key")
    .eq("id", client_id)
    .maybeSingle();
  if (clientError || !client?.tracking_key || !timingSafeEqualString(trackingKey, client.tracking_key)) {
    return unauthorized;
  }

  const location = cleanText(body.location, 120);
  const device = cleanText(body.device, 32);
  const lat = typeof body.lat === "number" && Number.isFinite(body.lat) && body.lat >= -90 && body.lat <= 90 ? body.lat : null;
  const lng = typeof body.lng === "number" && Number.isFinite(body.lng) && body.lng >= -180 && body.lng <= 180 ? body.lng : null;

  let finalLocation = location;
  let finalLat = lat;
  let finalLng = lng;
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
    console.error("track insert failed", insertError.message);
    return new Response(JSON.stringify({ error: "Could not record the visit" }), {
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
