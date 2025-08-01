/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export', // Required for static export
  trailingSlash: true, // Ensures static hosting works on Render
  images: {
    unoptimized: true // Prevents image optimization issues in static export
  },
  reactStrictMode: true
};

module.exports = nextConfig;