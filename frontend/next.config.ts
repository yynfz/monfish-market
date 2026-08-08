import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    // Allow Turbopack to resolve files outside the frontend/ directory (e.g. ../shared)
    root: path.join(__dirname, ".."),
  },
  // Fallback for `next build --no-turbopack`
  webpack(config) {
    config.resolve.alias["@shared"] = path.resolve(__dirname, "../shared");
    return config;
  },
};

export default nextConfig;
