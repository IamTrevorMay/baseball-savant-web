import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    middlewareClientMaxBodySize: '500mb',
  },
  serverExternalPackages: ['@napi-rs/canvas'],
};

export default nextConfig;
