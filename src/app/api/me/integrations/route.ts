import { supabaseAdmin } from "@/lib/supabase/server";

// dashboard_client_integrations has no client-facing RLS read policy (it
// holds OAuth tokens) — this route lets a logged-in client see which
// platforms are connected without ever exposing the tokens themselves.
// Requires the caller's own Supabase access token, verified server-side;
// only returns platform + connected_at for the client that token belongs to.
export async function GET(req: Request) {
  if (!supabaseAdmin) {
    return Response.json({ error: "Not configured" }, { status: 500 });
  }

  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return Response.json({ error: "Missing bearer token" }, { status: 401 });
  }

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData.user) {
    return Response.json({ error: "Invalid session" }, { status: 401 });
  }

  const { data: client, error: clientError } = await supabaseAdmin
    .from("dashboard_clients")
    .select("id")
    .eq("owner_user_id", userData.user.id)
    .limit(1)
    .maybeSingle();
  if (clientError || !client) {
    return Response.json({ connected: [] });
  }

  const { data: integrations, error: integrationsError } = await supabaseAdmin
    .from("dashboard_client_integrations")
    .select("platform, connected_at")
    .eq("client_id", client.id);
  if (integrationsError) {
    return Response.json({ error: integrationsError.message }, { status: 500 });
  }

  return Response.json({ connected: integrations ?? [] });
}
