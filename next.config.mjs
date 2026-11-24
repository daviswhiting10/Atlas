import withPWA from "@ducanh2912/next-pwa";

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["@auth/core", "jose", "pdf-parse", "pdfjs-dist", "@napi-rs/canvas"],
    // pdf.js loads @napi-rs/canvas and its own worker by name at run time, so the server bundle's file tracing never
    // sees them: ship them (and canvas's native build for Vercel's Linux) with the routes that read PDFs.
    outputFileTracingIncludes: {
      "/api/**/*": [
        "./node_modules/@napi-rs/canvas/**/*",
        "./node_modules/@napi-rs/canvas-linux-x64-gnu/**/*",
        // pdf.js starts its worker by file name too.
        "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
      ],
    },
  },
};

export default withPWA({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  cacheOnFrontEndNav: false,
  aggressiveFrontEndNavCaching: false,
  // Off: the page used to reload itself when the connection came back, which threw away anything half-typed (a new
  // client's form, a note) and every open sheet. The logger resends its own ticks; saves that fail say so and the page
  // re-reads itself (lib/net/guard).
  reloadOnOnline: false,
  // Don't precache the coach's certificate PDFs (4 MB every visitor would
  // download), and don't keep API responses — they hold signed-in data that
  // would outlive a sign-out.
  publicExcludes: ["!credentials/**/*"],
  workboxOptions: {
    disableDevLogs: true,
    // A new service worker waits until the app is closed and reopened instead of taking over a running page. Taking
    // over at once deleted the old build's precached scripts while a page still needed them, and with no skew
    // protection on Hobby the server no longer has them either: the page went dead. The first install still takes
    // control at once (clientsClaim; there is nothing old to replace), and old precache entries are cleared when the
    // new worker activates on the next cold start (cleanupOutdatedCaches only removes older Workbox formats).
    skipWaiting: false,
    clientsClaim: true,
    cleanupOutdatedCaches: true,
    // Static files only. Replaces the plugin's defaults, which also cache
    // pages and API responses.
    runtimeCaching: [
      { urlPattern: /\/_next\/static\/.*/i, handler: "CacheFirst", options: { cacheName: "next-static" } },
      { urlPattern: /\.(?:png|jpg|jpeg|svg|ico|woff2?)$/i, handler: "StaleWhileRevalidate", options: { cacheName: "static-assets" } },
    ],
  },
})(nextConfig);
