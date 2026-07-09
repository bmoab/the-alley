/** @type {import('next').NextConfig} */
const nextConfig = {
  // better-sqlite3 is a native module; keep it external to the server bundle.
  experimental: {
    serverComponentsExternalPackages: ["better-sqlite3"],
  },
  // thealleyoncenter.com (the "the" variant) also points at this app; send it
  // to the canonical domain.
  async redirects() {
    return ["thealleyoncenter.com", "www.thealleyoncenter.com"].map((host) => ({
      source: "/:path*",
      has: [{ type: "host", value: host }],
      destination: "https://alleyoncenter.com/:path*",
      permanent: true,
    }));
  },
};

export default nextConfig;
