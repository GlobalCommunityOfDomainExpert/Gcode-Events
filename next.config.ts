import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @ffmpeg-installer/ffmpeg picks its platform binary via a runtime
  // require() built from a variable path — Turbopack can't statically
  // resolve that and fails the build. Keep it external so it's just
  // require()'d by Node at runtime instead of bundled.
  // oracledb (src/infrastructure/database) loads optional native modules and
  // reads tnsnames/wallet files at runtime — bundling it breaks both.
  serverExternalPackages: ["@ffmpeg-installer/ffmpeg", "oracledb"],
};

export default nextConfig;
