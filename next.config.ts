import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdf-parse", "nodejs-whisper", "shelljs"],
};

export default nextConfig;
