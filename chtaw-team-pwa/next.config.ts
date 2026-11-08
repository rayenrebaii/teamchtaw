import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
const production = process.env.NODE_ENV === "production";
const backend = process.env.BACKEND_URL;
if (backend) {
  const url = new URL(backend);
  if (url.origin !== backend || url.username || url.password ||
      !["http:", "https:"].includes(url.protocol) || (production && url.protocol !== "https:"))
    throw Error("BACKEND_URL must be an exact HTTPS origin in production.");
}
const connect = new Set(["'self'"]);
for (const value of [process.env.NEXT_PUBLIC_API_URL, process.env.NEXT_PUBLIC_SOCKET_URL]) {
  if (!value) continue;
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw Error("Invalid public API or Socket URL.");
  if (production && (url.protocol !== "https:" || ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) throw Error("Production API and Socket URLs must use public HTTPS.");
  connect.add(url.origin);
  connect.add(url.origin.replace(/^http/, "ws"));
}
if (!production) { connect.add("http://127.0.0.1:3002"); connect.add("ws://127.0.0.1:3002"); }
const csp = [
  "default-src 'self'", `script-src 'self' 'unsafe-inline'${production ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:", "font-src 'self'",
  `connect-src ${[...connect].join(" ")}`, "object-src 'none'", "base-uri 'self'", "frame-ancestors 'none'", "form-action 'self'",
].join("; ");
const config: NextConfig = {
  devIndicators: false,
  turbopack: { root: fileURLToPath(new URL(".", import.meta.url)) },
  poweredByHeader: false,
  async rewrites() {
    // Keep refresh cookies first-party on the PWA's vercel.app domain.
    // Socket.IO uses NEXT_PUBLIC_SOCKET_URL to connect directly to Render.
    return backend ? [{ source: "/api/v1/:path*", destination: `${backend}/api/v1/:path*` }] : [];
  },
  async redirects() {
    return [{ source: "/admin/approvals", destination: "/admin/users?status=PENDING", permanent: false }];
  },
  async headers() {
    return [
      { source: "/:path*", headers: [{ key: "Content-Security-Policy", value: csp }, { key: "X-Content-Type-Options", value: "nosniff" }, { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" }, { key: "X-Frame-Options", value: "DENY" }] },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
    ];
  },
};
export default config;
