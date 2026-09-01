// Packs { clientId, accountId } into the OAuth `state` param so it survives
// the round trip to the provider and back — providers only echo `state`
// back verbatim, never any other query param we sent.
export function encodeOAuthState(clientId: string, accountId: string | null): string {
  return Buffer.from(JSON.stringify({ clientId, accountId })).toString("base64url");
}

export function decodeOAuthState(state: string | null): { clientId: string; accountId: string | null } | null {
  if (!state) return null;
  try {
    const parsed = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
    if (typeof parsed.clientId !== "string") return null;
    return { clientId: parsed.clientId, accountId: typeof parsed.accountId === "string" ? parsed.accountId : null };
  } catch {
    return null;
  }
}
