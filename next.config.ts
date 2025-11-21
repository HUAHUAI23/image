import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
      },
      {
        protocol: 'https',
        hostname: '**.volces.com', // Volcengine TOS (Object Storage)
      },
    ],
  },
};

export default nextConfig;
