const PRODUCTION_ORIGINS = ["https://heliastdashboard.com", "https://www.heliastdashboard.com"];

/**
 * Origin used for OAuth redirect URIs and post-connect redirects.
 * Reflecting the request Host would let a forged Host header turn the
 * callback into an open redirect and a mismatched token exchange. Unknown
 * hosts fall back to the canonical site instead of echoing the request.
 */
export function trustedOrigin(requestUrl: string): string {
  const origin = new URL(requestUrl).origin;
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  const allowed = new Set<string>(PRODUCTION_ORIGINS);
  if (configured) allowed.add(configured);
  if (allowed.has(origin)) return origin;
  if (origin === "http://localhost:3000" || origin === "http://127.0.0.1:3000") return origin;
  if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin)) return origin;
  return configured || "https://www.heliastdashboard.com";
}
