"use client";

import { ReactNode } from "react";
import { EventsShell } from "@/components/layout";
import { useSession } from "@/hooks/use-session";

export default function EventsLayout({ children }: { children: ReactNode }) {
  const session = useSession();

  return (
    <EventsShell session={session}>
      <div className="">{children}</div>
    </EventsShell>
  );
}
