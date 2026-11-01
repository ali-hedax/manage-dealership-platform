import type { NextConfig } from 'next';

// /api/v1/* is proxied to the API at runtime by app/api/v1/[...path]/route.ts.
const nextConfig: NextConfig = {
  // Standalone output is used by the Docker image (set NEXT_OUTPUT=standalone there).
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'same-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
