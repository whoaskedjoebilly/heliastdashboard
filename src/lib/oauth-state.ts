// Packs { clientId, accountId, ... } into the OAuth `state` param so it
// survives the round trip to the provider and back — providers only echo
// `state` back verbatim, never any other query param we sent.
//
// igAccountId/pageId are only used by the Meta flow, which needs to carry
// the Instagram business account and Facebook Page IDs through the round
// trip too so the callback can create "instagram"/"facebook" integration
// rows alongside "meta_ads" in one pass — every other caller just omits
// them and gets null back.
export function encodeOAuthState(
  clientId: string,
  accountId: string | null,
  extra?: { igAccountId?: string | null; pageId?: string | null }
): string {
  return Buffer.from(
    JSON.stringify({
      clientId,
      accountId,
      igAccountId: extra?.igAccountId ?? null,
      pageId: extra?.pageId ?? null,
    })
  ).toString("base64url");
}

export function decodeOAuthState(
  state: string | null
): { clientId: string; accountId: string | null; igAccountId: string | null; pageId: string | null } | null {
  if (!state) return null;
  try {
    const parsed = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
    if (typeof parsed.clientId !== "string") return null;
    return {
      clientId: parsed.clientId,
      accountId: typeof parsed.accountId === "string" ? parsed.accountId : null,
      igAccountId: typeof parsed.igAccountId === "string" ? parsed.igAccountId : null,
      pageId: typeof parsed.pageId === "string" ? parsed.pageId : null,
    };
  } catch {
    return null;
  }
}
