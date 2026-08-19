import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Upload de foto envia imagem otimizada + thumb no mesmo FormData (multipart > 1 MB).
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
