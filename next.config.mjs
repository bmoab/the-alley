/** @type {import('next').NextConfig} */
const nextConfig = {
  // better-sqlite3 and sharp are native modules; keep them external to the
  // server bundle so Next doesn't try to trace their platform binaries.
  experimental: {
    serverComponentsExternalPackages: ["better-sqlite3", "sharp"],
  },
};

export default nextConfig;
