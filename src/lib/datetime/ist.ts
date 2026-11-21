// Event times are India Standard Time end to end: wall-clock input is IST,
// and display/prefill convert instants back to IST. Shared by the browser
// adapters and the server.

// Combine the wizard's separate date ("2026-08-01") + time ("14:30") inputs
// into one ISO timestamp for the DB. Missing time -> midnight.
// Wall-clock date+time typed by the user is IST -> stamp with +05:30 so the
// stored instant is correct.
export function toIsoTimestamp(
  date: string,
  time?: string,
): string | undefined {
  if (!date) return undefined;
  return `${date}T${time && time !== "" ? time : "00:00"}:00+05:30`;
}

// All event times are IST (Asia/Kolkata). Wall-clock input is interpreted as
// IST; display + prefill convert back to IST.
export const IST = "Asia/Kolkata";

// ISO date "yyyy-mm-dd" of an instant, in IST.
export function istDate(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: IST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

// 24h "HH:MM" of an instant, in IST.
export function istTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: IST,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}
