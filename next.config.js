/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable static export
  output: 'export',

  // Optional: Enable strict mode for React
  reactStrictMode: true,

  // Optional: Configure images if you use <Image />
  images: {
    unoptimized: true // Needed for static export
  },

  // Optional: Future-proof settings
  swcMinify: true
};

module.exports = nextConfig;