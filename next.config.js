/** @type {import('next').NextConfig} */
const nextConfig = {
  // Output standalone build for packaging
  output: 'standalone',
  
  // Enable server actions
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  
  // Configure webpack for parquet-wasm
  webpack: (config, { isServer }) => {
    // Handle WASM files
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    };

    // Fix for parquet-wasm in client-side
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
      };
    }

    return config;
  },
};

module.exports = nextConfig;
