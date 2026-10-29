import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker 部署：產生自帶依賴的 .next/standalone
  output: "standalone",
  poweredByHeader: false,
  experimental: {
    // Notion 匯入：整理後的內容一次送出（文字為主，通常不到幾 MB）
    serverActions: { bodySizeLimit: "20mb" },
  },
};

export default nextConfig;
