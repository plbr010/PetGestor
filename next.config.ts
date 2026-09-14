import type { NextConfig } from "next";

import {
  buildNextSecurityHeaders,
  shouldEnableHsts,
} from "./src/lib/security/http-headers";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
    proxyClientMaxBodySize: "10mb",
  },
  async headers() {
    return buildNextSecurityHeaders({
      enableHsts: shouldEnableHsts(),
    });
  },
};

export default nextConfig;
