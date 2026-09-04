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

  // Compete nav restructure (2026-09-04): every page moved under its new
  // Review / Performance / Reports group. Kept non-permanent on purpose — the
  // platform build-out may move these again, and 308s stick in browser caches.
  // Note there is deliberately no /compete/reports/:id rule: config redirects
  // are matched before filesystem routes, so it would shadow the real
  // /compete/reports/{bullpen,command,biomechanics,live-abs} pages.
  async redirects() {
    return [
      { source: '/compete/review', destination: '/compete/review/command', permanent: false },
      { source: '/compete/review/settings', destination: '/compete/review/command/settings', permanent: false },
      { source: '/compete/review/stats', destination: '/compete/review/command/stats', permanent: false },
      { source: '/compete/video', destination: '/compete/review/video', permanent: false },
      { source: '/compete/whoop', destination: '/compete/performance/health', permanent: false },
      // Both of these served different content than their new namesake group:
      // /compete/performance was the TrackMan bullpen page, /compete/reports was
      // the coach-delivered PDF list. Send them where their content actually went.
      { source: '/compete/performance', destination: '/compete/reports/bullpen', permanent: false },
      { source: '/compete/reports', destination: '/compete/performance/scouting-reports', permanent: false },
    ]
  },
};

export default nextConfig;
