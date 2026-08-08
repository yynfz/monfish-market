import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    // Allow Turbopack to resolve files outside the frontend/ directory (e.g. ../shared)
    root: path.join(__dirname, ".."),
    resolveAlias: {
      viem: path.join(__dirname, "node_modules/viem"),
    },
  },
  // Fallback for `next build --no-turbopack`
  webpack(config) {
    config.resolve.alias["@shared"] = path.resolve(__dirname, "../shared");
    config.resolve.alias["viem"] = path.resolve(__dirname, "node_modules/viem");
    return config;
  },
};

export default nextConfig;
