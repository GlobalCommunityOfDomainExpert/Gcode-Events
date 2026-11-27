import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @ffmpeg-installer/ffmpeg picks its platform binary via a runtime
  // require() built from a variable path — Turbopack can't statically
  // resolve that and fails the build. Keep it external so it's just
  // require()'d by Node at runtime instead of bundled.
  // oracledb (src/infrastructure/database) loads optional native modules and
  // reads tnsnames/wallet files at runtime — bundling it breaks both.
  serverExternalPackages: ["@ffmpeg-installer/ffmpeg", "oracledb"],

  // The events list is the homepage: it is served at "/" (the page itself
  // lives in app/(public)/events), and the old "/events" URL redirects there.
  // Event pages stay at /events/<id>.
  async rewrites() {
    return { beforeFiles: [{ source: "/", destination: "/events" }] };
  },
  async redirects() {
    return [{ source: "/events", destination: "/", permanent: false }];
  },
};

export default nextConfig;
