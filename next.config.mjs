/** @type {import('next').NextConfig} */
const nextConfig = {
  // better-sqlite3 has a native `.node` binding; keep it external so
  // Turbopack doesn't try to bundle the prebuilt binary.
  serverExternalPackages: ['better-sqlite3'],

  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 't.vndb.org' },
      { protocol: 'https', hostname: 's.vndb.org' },
    ],
  },
};

export default nextConfig;
