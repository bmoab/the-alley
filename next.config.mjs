/** @type {import('next').NextConfig} */
const nextConfig = {
  // better-sqlite3, sharp and @napi-rs/canvas are native modules (and pdfjs-dist
  // loads its worker from disk); keep them external to the
  // server bundle so Next doesn't try to trace their platform binaries.
  experimental: {
    serverComponentsExternalPackages: ["better-sqlite3", "sharp", "pdfjs-dist", "@napi-rs/canvas"],
    // Bank statements are uploaded through a server action (Money → Bank); the
    // default 1 MB cap is too small for a few months of a busy account.
    serverActions: { bodySizeLimit: "5mb" },
  },
};

export default nextConfig;
