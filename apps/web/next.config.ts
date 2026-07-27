import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // @arka/ui ships TypeScript source directly, no build step, the same
  // convention every package in this monorepo follows; Next only compiles a
  // workspace package it's told about.
  transpilePackages: ['@arka/ui'],
}

export default nextConfig
