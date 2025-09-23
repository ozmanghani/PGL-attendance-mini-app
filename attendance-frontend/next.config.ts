import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* other config options here */

  // Enable static export
  output: "export",

  // Disable ESLint overlay in development
  eslint: {
    ignoreDuringBuilds: true,
  },

  // Customize Webpack to remove the React Refresh overlay
  webpack(config, { dev, isServer }) {
    if (dev && !isServer) {
      // Filter out ReactRefreshWebpackPlugin to remove overlay
      config.plugins = config.plugins.filter(
        (plugin: { constructor: { name: string } }) =>
          plugin.constructor.name !== "ReactRefreshWebpackPlugin"
      );
    }
    return config;
  },
};

export default nextConfig;
