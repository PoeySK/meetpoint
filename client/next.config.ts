import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the FSD `pages/` layer while reserving the `.page.*` suffix for
  // actual Next route entries. The application routes live in `app/`.
  pageExtensions: [
    'page.tsx',
    'page.ts',
    'page.jsx',
    'page.js',
    'layout.tsx',
    'layout.ts',
    'route.ts',
    'route.tsx',
  ],
};

export default nextConfig;
