/** @type {import('next').NextConfig} */
const nextConfig = {
  // Output standalone build for packaging
  output: 'standalone',

  // Enable server actions
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
    // In development, externalize gRPC/protobuf packages from webpack bundling.
    // This prevents protobuf `instanceof` failures caused by duplicate module instances
    // when using npm link. Not needed in production (no symlinks).
    ...(process.env.NODE_ENV !== 'production' ? {
      serverComponentsExternalPackages: ['@gizmodata/gizmosql-client', '@grpc/grpc-js', 'google-protobuf'],
    } : {}),
  },

   images: {
    unoptimized: true,
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
