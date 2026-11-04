import path from "node:path";
import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // A package-lock.json in the home folder must not become the workspace root.
  turbopack: { root: path.dirname(fileURLToPath(import.meta.url)) },
  poweredByHeader: false,
  devIndicators: false,
  agentRules: false,
  images: { unoptimized: true },
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      ],
    }];
  },
};
export default nextConfig;
