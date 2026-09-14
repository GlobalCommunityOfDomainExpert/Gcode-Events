// Anonymous reactions have no participant/attendee identity behind them —
// this is the only thing that ties repeated taps from the same browser
// together (server-side 1s-per-device throttle keyed on it, see
// GCODE_RATINGS_API.submit_reaction). Persisted in localStorage so it
// survives a refresh; generated fresh per browser/device, never sent
// anywhere except with a reaction tap.
const STORAGE_KEY = "gcode-reaction-device-token";

function randomToken(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // Fallback for older browsers without crypto.randomUUID — doesn't need to
  // be cryptographically strong, just unique enough to dedupe one device.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function getDeviceToken(): string {
  if (typeof window === "undefined") return randomToken();
  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
    const token = randomToken();
    window.localStorage.setItem(STORAGE_KEY, token);
    return token;
  } catch {
    // Private browsing / storage blocked — still works for this tap, just
    // won't persist across a refresh (each tap looks like a new device).
    return randomToken();
  }
}
