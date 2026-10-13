import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Docker image runs the self-contained server from .next/standalone.
  output: "standalone",
};

export default nextConfig;
