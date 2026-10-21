// Events with a client dashboard. Add an id here to enable /client/<id>.
export const CLIENT_DASHBOARD_EVENT_IDS = ["501"] as const;

export function isDashboardEvent(eventId: string): boolean {
  return (CLIENT_DASHBOARD_EVENT_IDS as readonly string[]).includes(eventId);
}

// TODO: hardcoded fallbacks for now; set the env vars and drop them.
export const CLIENT_DASHBOARD_PASSWORD =
  process.env.CLIENT_DASHBOARD_PASSWORD ?? "KayKoyFounderDilemma123";
export const CLIENT_DASHBOARD_SECRET =
  process.env.CLIENT_DASHBOARD_SECRET ?? "gcode-client-dashboard-secret";
