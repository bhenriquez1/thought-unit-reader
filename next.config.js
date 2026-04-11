/** @type {import('next').NextConfig} */
const path = require('path');
const { execSync } = require('child_process');

// Get git SHA at build time
let gitSha = 'dev';
try {
  gitSha = execSync('git rev-parse --short HEAD').toString().trim();
} catch (e) {
  console.warn('Could not get git SHA:', e.message);
}

const nextConfig = {
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    // keep this if you rely on unoptimized images; otherwise you can remove it
    unoptimized: true,
  },
  env: {
    NEXT_PUBLIC_BUILD_SHA: gitSha,
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
  },
  webpack: (config) => {
    config.resolve.alias['@'] = path.resolve(__dirname);
    return config;
  },
};

module.exports = nextConfig;