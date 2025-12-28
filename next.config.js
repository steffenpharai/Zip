/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Enhanced logging for Docker console output
  logging: {
    fetches: {
      fullUrl: true,
    },
  },
  // Ensure Fast Refresh works in Docker with file polling
  webpack: (config, { dev }) => {
    if (dev && process.env.WATCHPACK_POLLING === 'true') {
      config.watchOptions = {
        poll: 1000,
        aggregateTimeout: 300,
      };
    }
    return config;
  },
};

module.exports = nextConfig;

