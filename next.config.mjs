/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['better-sqlite3'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 't.vndb.org' },
      { protocol: 'https', hostname: 's.vndb.org' },
    ],
  },
};

export default nextConfig;
