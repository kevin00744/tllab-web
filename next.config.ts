import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker 部署：產生自帶依賴的 .next/standalone
  output: "standalone",
  poweredByHeader: false,
};

export default nextConfig;
