/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Pull in only the icons/animations we actually use instead of whole
    // libraries -- less for the bundler to read on every dev compile.
    optimizePackageImports: ["lucide-react", "motion", "@privy-io/react-auth"],
  },
};

module.exports = nextConfig;
