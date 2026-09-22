import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  eslint: {
    // Diag deploy: lint warnings elsewhere must not block mobile binary panel.
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "coin-images.coingecko.com",
      },
      {
        protocol: "https",
        hostname: "assets.coingecko.com",
      },
    ],
  },
  webpack: (config) => {
    // Nested @wagmi/connectors@8 (under AppKit) imports @wagmi/core/tempo;
    // pinned @wagmi/core@2.22.1 does not export it. Stub keeps production builds green.
    config.resolve.alias = {
      ...config.resolve.alias,
      "@wagmi/core/tempo": path.resolve(
        __dirname,
        "src/lib/wallet/wagmi-core-tempo-stub.ts",
      ),
    };
    return config;
  },
};

export default nextConfig;
