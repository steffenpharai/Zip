/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Use webpack instead of Turbopack (Next.js 16 defaults to Turbopack)
  // Empty turbopack config tells Next.js to use webpack
  turbopack: {},
  // Enhanced logging for Docker console output
  logging: {
    fetches: {
      fullUrl: true,
    },
  },
  // Ensure Fast Refresh works in Docker with file polling
  webpack: (config, { dev, isServer }) => {
    if (dev && process.env.WATCHPACK_POLLING === 'true') {
      config.watchOptions = {
        poll: 1000,
        aggregateTimeout: 300,
        ignored: [
          '**/node_modules/**',
          '**/.next/**',
          '**/data/**',
          '**/*.log',
          '**/*.jsonl',
          '**/.git/**',
        ],
      };
    }
    
    // Mark R3F as external for server-side to prevent evaluation issues
    if (isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        '@react-three/fiber': false,
        '@react-three/drei': false,
        '@react-three/postprocessing': false,
        '@react-spring/three': false,
      };
    }
    
    return config;
  },
};

module.exports = nextConfig;

