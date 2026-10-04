import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 is a native Node.js module — must not be bundled by webpack
  serverExternalPackages: ["better-sqlite3"],

  // Allow larger file uploads for Excel imports
  experimental: {},
};

export default nextConfig;
