/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
  output: 'export',         // For static export builds (e.g. Render)
  distDir: 'out',           // Custom output directory
  images: {
    unoptimized: true       // Required when using static export with images
  },
  webpack: (config) => {
    config.resolve.alias['@'] = path.resolve(__dirname); // Enables "@/lib" or "@/components" imports
    return config;
  }
};

module.exports = nextConfig;