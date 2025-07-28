/** @type {import('next').NextConfig} */
const path = require("path");

const nextConfig = {
  output: 'export',
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  webpack: (config) => {
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      canvas: false,
      a: path.resolve(__dirname, "components"),
      "@": path.resolve(__dirname),
    };
    return config;
  },
};

module.exports = nextConfig;