import withPWA from "@ducanh2912/next-pwa";

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["@auth/core", "jose", "pdf-parse", "pdfjs-dist", "@napi-rs/canvas"],
    // pdf.js loads @napi-rs/canvas by name at run time, so the server bundle's file tracing never sees it: ship it (and
    // its native build for Vercel's Linux) with the routes that read PDFs.
    outputFileTracingIncludes: {
      "/api/**/*": ["./node_modules/@napi-rs/canvas/**/*", "./node_modules/@napi-rs/canvas-linux-x64-gnu/**/*"],
    },
  },
};

export default withPWA({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  cacheOnFrontEndNav: false,
  aggressiveFrontEndNavCaching: false,
  reloadOnOnline: true,
  // Don't precache the coach's certificate PDFs (4 MB every visitor would
  // download), and don't keep API responses — they hold signed-in data that
  // would outlive a sign-out.
  publicExcludes: ["!credentials/**/*"],
  workboxOptions: {
    disableDevLogs: true,
    // Static files only. Replaces the plugin's defaults, which also cache
    // pages and API responses.
    runtimeCaching: [
      { urlPattern: /\/_next\/static\/.*/i, handler: "CacheFirst", options: { cacheName: "next-static" } },
      { urlPattern: /\.(?:png|jpg|jpeg|svg|ico|woff2?)$/i, handler: "StaleWhileRevalidate", options: { cacheName: "static-assets" } },
    ],
  },
})(nextConfig);
