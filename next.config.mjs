/** @type {import('next').NextConfig} */
const nextConfig = {
  // better-sqlite3, sharp and @napi-rs/canvas are native modules (and pdfjs-dist
  // loads its worker from disk); keep them external to the
  // server bundle so Next doesn't try to trace their platform binaries.
  experimental: {
    serverComponentsExternalPackages: ["better-sqlite3", "sharp", "pdfjs-dist", "@napi-rs/canvas"],
  },
};

export default nextConfig;
