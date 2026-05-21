import withPWA from "@ducanh2912/next-pwa";

// ─── CACHE_VERSION / DEPLOY CHECKLIST ────────────────────────────────────────
// Cache invalidation is automatic: every `next build` produces new content
// hashes, which Workbox uses to replace stale precache entries on SW activation.
// You do NOT need to manually bump a number.
//
// Before each deploy:
//   1. Run `next build`  ← regenerates public/sw.js with fresh asset hashes
//   2. `git add public/sw.js public/workbox-*.js && git commit -m "chore: bump sw"`
//   3. Push to Vercel — new sw.js is served; old clients get updated SW on
//      next visit and stale caches are cleared automatically.
// ─────────────────────────────────────────────────────────────────────────────

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["@auth/core", "jose"],
  },
};

export default withPWA({
  dest: "public",
  // SW is disabled in development so hot-reload isn't interrupted.
  // To test PWA behaviour, deploy to a Vercel preview branch.
  disable: process.env.NODE_ENV === "development",
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: false,
  reloadOnOnline: true,

  // Offline fallback: when a navigation request fails (no network + no cache),
  // serve the pre-rendered /offline page instead of a bare browser error screen.
  fallbacks: {
    document: "/offline",
  },

  workboxOptions: {
    disableDevLogs: true,
    runtimeCaching: [
      {
        // Static assets are content-hashed — cache-first is always safe and
        // makes repeat visits feel instant.
        urlPattern: /\/_next\/static\/.*/,
        handler: "CacheFirst",
        options: {
          cacheName: "next-static-assets",
          expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 365 },
          cacheableResponse: { statuses: [0, 200] },
        },
      },
      {
        // API routes — network-first, 10 s timeout, then cached fallback.
        // Write operations will fail offline; PWAProvider surfaces a toast.
        urlPattern: /\/api\/.*/,
        handler: "NetworkFirst",
        options: {
          cacheName: "api-cache",
          networkTimeoutSeconds: 10,
          cacheableResponse: { statuses: [0, 200] },
        },
      },
      {
        // App pages — stale-while-revalidate: serve instantly from cache,
        // refresh in the background.
        urlPattern: /^https?:\/\/[^/]+\/((?!api\/|_next\/).*)$/,
        handler: "StaleWhileRevalidate",
        options: {
          cacheName: "pages-cache",
          expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 },
          cacheableResponse: { statuses: [0, 200] },
        },
      },
    ],
  },
})(nextConfig);
