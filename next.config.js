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
    // pdfjs-dist's build references an optional Node `canvas` dependency it
    // never actually uses in the browser (that path is for server-side
    // rendering PDFs to a Node canvas, not something this app does). The
    // Pages Router's dynamic ssr:false import of SmartPDFViewer never
    // resolves this module graph at build time, so it never hit this; the
    // App Router (app/elena/page.tsx) resolves the full module graph even
    // for a client-only import, which does. Stubbing `canvas` out is the
    // standard fix — it's a no-op in the browser code path either way.
    config.resolve.alias.canvas = false;
    return config;
  },
};

module.exports = nextConfig;