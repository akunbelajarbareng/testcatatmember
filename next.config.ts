import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 is a native Node.js module — must not be bundled by webpack
  serverExternalPackages: ["better-sqlite3"],

  // Allow local network IP access in dev mode without cross-origin blocking
  allowedDevOrigins: ["192.168.1.192", "192.168.1.192:3000", "localhost", "localhost:3000"],

  // Allow larger file uploads for Excel imports
  experimental: {},
};

export default nextConfig;
