const isDevelopment = process.env.NODE_ENV === 'development';
const isInteractionQa = process.env.VNCOLL_QA === '1';
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self'${isDevelopment ? ' ws:' : ''} https://nominatim.openstreetmap.org`,
  "media-src 'self' blob: https:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "frame-src 'none'",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  ...(isDevelopment || isInteractionQa ? [] : ['upgrade-insecure-requests']),
].join('; ');

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  allowedDevOrigins: ['127.0.0.1'],
  // better-sqlite3 has a native `.node` binding; keep it external so
  // Turbopack doesn't try to bundle the prebuilt binary.
  serverExternalPackages: ['better-sqlite3'],

  // Only relevant for any future `<Image src="…">` consumer of an
  // external host. The app currently routes every external image
  // through `<SafeImage>` (a plain `<img>`), so this list isn't
  // exercised — but it's still the right gate, mirroring the full
  // server-side allowlist in `src/lib/url-allowlist.ts`. If a new
  // surface starts using `next/image` for external sources, add
  // each host here too (and remember Next's `next/image` does its
  // own SSRF gate via this exact `remotePatterns` array).
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 't.vndb.org' },
      { protocol: 'https', hostname: 's.vndb.org' },
    ],
  },

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: contentSecurityPolicy },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
