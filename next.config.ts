import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@deck.gl/core",
    "@deck.gl/layers",
    "@deck.gl/mapbox",
    "@luma.gl/core",
    "@luma.gl/webgl",
    "@luma.gl/shadertools",
    "@math.gl/core",
    "@math.gl/web-mercator",
  ],
};

export default nextConfig;
