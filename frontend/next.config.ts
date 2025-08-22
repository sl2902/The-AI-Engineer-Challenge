import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: "/v1/:path*",
        destination: "https://api.openai.com/v1/:path*",
      },
    ];
  },
};

export default nextConfig;
