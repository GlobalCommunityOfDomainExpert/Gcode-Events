import { ReactNode } from "react";

// Full-screen rooms (the webinar live room) — no site navbar or footer, like
// the advisory app's /call room.
export default function RoomLayout({ children }: { children: ReactNode }) {
  return <div className="flex min-h-screen flex-col">{children}</div>;
}
