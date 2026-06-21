/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // brain.js uses node modules, exclude from client bundle issues
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false, path: false, crypto: false, stream: false,
      };
    }
    return config;
  },
};

export default nextConfig;
