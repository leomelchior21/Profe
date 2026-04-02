import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts"],
  },
  outputFileTracingIncludes: {
    "/*": ["./data/**/*"],
  },
};

export default nextConfig;
