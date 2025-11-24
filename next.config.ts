import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone', // Enable standalone output for Docker deployment
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
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb', // Increase from default 1mb to support image uploads
    },
  },
  // Prevent webpack from bundling pino and its dependencies (Node.js only packages)
  // This fixes build errors where webpack tries to bundle test files from thread-stream
  serverExternalPackages: ['pino'],
}

export default nextConfig
