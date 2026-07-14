import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project. A stray lockfile at ~/package-lock.json
  // otherwise makes Next infer /Users/trevor as the root, so Turbopack resolves
  // node_modules (tailwindcss, etc.) from the wrong place and pages hang.
  turbopack: {
    root: __dirname,
  },
  experimental: {
    middlewareClientMaxBodySize: '500mb',
  },
  serverExternalPackages: ['@napi-rs/canvas'],
};

export default nextConfig;
