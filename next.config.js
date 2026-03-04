/** @type {import('next').NextConfig} */
const nextConfig = {
  // Output standalone build for packaging
  output: 'standalone',

  // Externalize gRPC/protobuf native packages from bundling
  serverExternalPackages: ['@gizmodata/gizmosql-client', '@grpc/grpc-js', 'google-protobuf'],

  // Enable server actions
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },

   images: {
    unoptimized: true,
  },

  // Turbopack is the default bundler in Next.js 16
  turbopack: {},

  // Configure webpack for parquet-wasm (used when building with --webpack flag)
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
