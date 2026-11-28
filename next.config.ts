import type { NextConfig } from "next";
import { BASE_PATH } from "./src/lib/base-path";

const nextConfig: NextConfig = {
  // @ffmpeg-installer/ffmpeg picks its platform binary via a runtime
  // require() built from a variable path — Turbopack can't statically
  // resolve that and fails the build. Keep it external so it's just
  // require()'d by Node at runtime instead of bundled.
  // oracledb (src/infrastructure/database) loads optional native modules and
  // reads tnsnames/wallet files at runtime — bundling it breaks both.
  serverExternalPackages: ["@ffmpeg-installer/ffmpeg", "oracledb"],

  // Served under uat.gcode.in/events through a reverse proxy, which must
  // forward the path unchanged (no prefix stripping). See src/lib/base-path.ts.
  // The events list is the homepage ("/events") and event pages sit right
  // under it ("/events/<id>"), from app/(public)/(events).
  basePath: BASE_PATH,
};

export default nextConfig;
