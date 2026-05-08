/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["@auth/core", "jose"],
  },
};

export default nextConfig;
