/** @type {import('next').NextConfig} */
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
// Use CORS_ORIGIN (primary) or ALLOWED_ORIGIN (backward compatible)
const allowedOrigin = process.env.CORS_ORIGIN || process.env.ALLOWED_ORIGIN || 'http://localhost:5173';
const __dirname = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = join(__dirname, '..');

const nextConfig = {
  reactStrictMode: true,
  // Silence Next.js multi-lockfile root detection by explicitly pointing to monorepo root
  outputFileTracingRoot: workspaceRoot,

  // We only use Next.js for API routes in this sub-project.
  // App Router is enabled by default (app directory).
  experimental: {
    // Keep default settings minimal; add flags here if needed later.
  },


  async headers() {
    return [
      {
        // matching all API routes
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Credentials", value: "true" },
          { key: "Access-Control-Allow-Origin", value: allowedOrigin },
          { key: "Access-Control-Allow-Methods", value: "GET,OPTIONS,PATCH,DELETE,POST,PUT" },
          { key: "Access-Control-Allow-Headers", value: "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, x-session-token" },
        ]
      }
    ]
  },

  // For monorepo use, ensure only server-side code is bundled.
  // No special output config required for Route Handlers.
};

export default nextConfig;
