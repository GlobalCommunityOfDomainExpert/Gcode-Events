// The sub-path the app is served under: uat.gcode.in reverse-proxies
// /events/* to this app, so every URL lives below /events. next.config.ts
// reads this as `basePath`.
//
// Next adds it on its own to <Link>, useRouter, redirect() and /_next assets.
// Anything else needs it added by hand: fetch(), <img>/<Image> src, plain
// <a href>, and absolute URLs built from window.location.origin.
export const BASE_PATH = "/events";

/** An in-app path ("/api/v1/…", "/app-logo.png") with the base path. */
export const withBasePath = (path: string) => `${BASE_PATH}${path}`;

/** Absolute URL of an in-app path, for links people copy or share. */
export const appUrl = (path: string) =>
  `${typeof window === "undefined" ? "" : window.location.origin}${BASE_PATH}${path}`;
