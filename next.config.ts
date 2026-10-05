import type { NextConfig } from 'next';
const config: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  turbopack: { root: process.cwd() },
  outputFileTracingExcludes: { '*': ['.data/**/*', '.logs/**/*', 'test-results/**/*'] },
  outputFileTracingIncludes: { '/*': ['./migrations/*.sql', './data/official/snapshot.json'] },
  serverExternalPackages: ['@electric-sql/pglite', 'pg'],
  experimental: { serverActions: { bodySizeLimit: '8mb' } },
  async headers() { return [{ source: '/:path*', headers: [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'X-Frame-Options', value: 'DENY' }
  ] }]; }
};
export default config;
