import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@ffmpeg-installer/ffmpeg",
    "oracledb",
  ],

  basePath: "/events",
};

export default nextConfig;
