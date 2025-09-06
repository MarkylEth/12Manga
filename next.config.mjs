 /** @type {import('next').NextConfig} */
 const nextConfig = {
  experimental: { turbo: {} },
  images: {
    // Либо перечисли известные домены:
    remotePatterns: [
      // Wasabi S3
      { protocol: 'https', hostname: '*.wasabisys.com' },
      { protocol: 'https', hostname: 's3.*.wasabisys.com' },

      // встречались у тебя
      { protocol: 'https', hostname: 'image.winudf.com' },
      { protocol: 'https', hostname: '*.winudf.com' },
      { protocol: 'https', hostname: 'xlm.ru' },
      { protocol: 'https', hostname: 'cdn.discordapp.com' },
    ],
  },
};
export default nextConfig;