/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Pull in only the icons/animations we actually use instead of whole
    // libraries -- less for the bundler to read on every dev compile.
    optimizePackageImports: ["lucide-react", "motion", "@privy-io/react-auth"],
  },
  webpack: (config) => {
    // @privy-io/react-auth 3.x references optional add-ons (Farcaster mini
    // apps, Solana, Abstract wallets) that dripp doesn't use or install. Mark
    // them as intentionally absent so the bundler doesn't fail on them; the
    // code that loads them only runs inside those environments.
    config.resolve.alias = {
      ...config.resolve.alias,
      "@farcaster/mini-app-solana": false,
      "@solana-program/memo": false,
      "@abstract-foundation/agw-client": false,
      "@abstract-foundation/agw-client/actions": false,
    };
    return config;
  },
};

module.exports = nextConfig;
