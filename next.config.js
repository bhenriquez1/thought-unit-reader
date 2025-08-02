/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export', // Replaces deprecated `next export`
  distDir: 'out',   // Render will use "out" as publish directory
  images: {
    unoptimized: true // Required for static export with images
  }
};

module.exports = nextConfig;