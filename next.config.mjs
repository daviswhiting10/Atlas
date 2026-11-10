import withPWA from "@ducanh2912/next-pwa";

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["@auth/core", "jose"],
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
