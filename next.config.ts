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
  // Prevent webpack from bundling Node.js only packages and packages with dynamic imports
  // - pino: Fixes build errors with thread-stream test files
  // - wechatpay-node-v3: Payment SDK with formidable dependency chain
  // - alipay-sdk: Payment SDK (excluded to avoid potential bundling issues)
  // - superagent: HTTP client used by wechatpay-node-v3
  // - formidable: Uses dynamic plugin imports that break webpack bundling
  serverExternalPackages: ['pino', 'wechatpay-node-v3', 'alipay-sdk', 'superagent', 'formidable'],
}

export default nextConfig
