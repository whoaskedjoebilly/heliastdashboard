import { decodeOAuthState, type OAuthStatePayload } from "./oauth-state";
import { trustedOrigin } from "./request-origin";
import { supabaseAdmin } from "./supabase/server";

const NO_STORE = { "Cache-Control": "private, no-store" };

export function noStoreResponse(message: string, status: number): Response {
  return new Response(message, { status, headers: NO_STORE });
}

export async function logProviderFailure(res: Response, label: string): Promise<Response> {
  const detail = await res.text();
  console.error(`${label} (${res.status}): ${detail.slice(0, 800)}`);
  return noStoreResponse(`${label}.`, 502);
}

export interface VerifiedOAuthCallback {
  url: URL;
  origin: string;
  code: string;
  state: OAuthStatePayload;
}

/** Verifies the signed state, then confirms the client row exists before
 * any token is written. Does not trust client_id from the query string. */
export async function readOAuthCallback(req: Request): Promise<{ ok: true; value: VerifiedOAuthCallback } | { ok: false; response: Response }> {
  const url = new URL(req.url);
  const origin = trustedOrigin(req.url);
  if (url.searchParams.get("error")) {
    return { ok: false, response: noStoreResponse("The provider rejected the connection request.", 400) };
  }
  const code = url.searchParams.get("code");
  const rawState = url.searchParams.get("state");
  const state = decodeOAuthState(rawState);
  if (!code || !state) {
    const message = rawState
      ? "Invalid or expired connection request. Start the connect flow again."
      : "Missing authorization code or state.";
    return { ok: false, response: noStoreResponse(message, 400) };
  }
  if (!supabaseAdmin) {
    return { ok: false, response: noStoreResponse("SUPABASE_SERVICE_ROLE_KEY is not configured", 500) };
  }
  const { data, error } = await supabaseAdmin.from("dashboard_clients").select("id").eq("id", state.clientId).maybeSingle();
  if (error || !data) {
    return { ok: false, response: noStoreResponse("Unknown client.", 400) };
  }
  return { ok: true, value: { url, origin, code, state } };
}
