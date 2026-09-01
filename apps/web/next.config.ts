import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@atmos/contracts', '@atmos/domain', '@atmos/provider-openmeteo'],
  allowedDevOrigins: ['127.0.0.1'],
};

export default nextConfig;
