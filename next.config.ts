import type { NextConfig } from "next";

// 整站輸出成靜態檔（out/），由 Cloudflare Workers 的 static assets 直接送
const nextConfig: NextConfig = {
  output: "export",
};

export default nextConfig;
