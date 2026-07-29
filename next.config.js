/** @type {import('next').NextConfig} */
const nextConfig = {
  // Output standalone build for packaging
  output: 'standalone',

  // Externalize the ADBC stack (ESM + native addon + driver library)
  // so routes require() it at runtime — the packaged launcher redirects
  // those requires to real-disk extracted copies (pkg's snapshot
  // mangles ESM and cannot dlopen natives).
  serverExternalPackages: [
    '@gizmodata/gizmosql-client',
    '@apache-arrow/adbc-driver-manager',
    'apache-arrow',
  ],

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
