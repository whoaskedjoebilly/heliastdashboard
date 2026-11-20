import type { NextConfig } from "next";
import { securityHeaders } from "./src/lib/security-headers";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    // `/:path*` matches `/` and every nested route, including /api and
    // /_next/static (see the headers config reference: a `*` modifier is
    // zero or more path segments). The API rule is listed second so its
    // Cache-Control replaces any earlier value on those paths only.
    return [
      {
        source: "/:path*",
        headers: securityHeaders(),
      },
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
    ];
  },
};

export default nextConfig;
