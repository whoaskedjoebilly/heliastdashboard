/**
 * Response headers applied to every route from next.config.ts.
 *
 * CSP keeps 'unsafe-inline' for scripts and styles because the App Router
 * bootstraps with inline scripts and this UI uses inline style attributes.
 * A nonce-based policy would be stricter, but it needs a middleware that
 * rewrites every document response; this policy is enforced (not
 * report-only) and still blocks framing, object embeds, and unexpected
 * network origins. 'unsafe-eval' is limited to development, where the
 * Next.js dev server needs it.
 */
export function securityHeaders(): { key: string; value: string }[] {
  const isProd = process.env.NODE_ENV === "production";
  const scriptSrc = isProd ? "script-src 'self' 'unsafe-inline'" : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";
  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "form-action 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
    "worker-src 'self'",
    "manifest-src 'self'",
  ];
  if (isProd) directives.push("upgrade-insecure-requests");

  return [
    { key: "Content-Security-Policy", value: directives.join("; ") },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: [
        "camera=()",
        "microphone=()",
        "geolocation=()",
        "payment=()",
        "usb=()",
        "accelerometer=()",
        "gyroscope=()",
        "magnetometer=()",
        "browsing-topics=()",
        "interest-cohort=()",
      ].join(", "),
    },
    // Matches the HSTS policy Vercel already sends on heliastdashboard.com
    // (max-age=63072000, no includeSubDomains). Setting it here keeps the
    // header if the app is ever served off that platform default.
    { key: "Strict-Transport-Security", value: "max-age=63072000" },
    { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    { key: "X-DNS-Prefetch-Control", value: "off" },
  ];
}
