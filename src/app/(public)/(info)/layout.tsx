"use client";

import { ReactNode } from "react";
import { EventsShell } from "@/components/layout";
import { useSession } from "@/hooks/use-session";

export default function InfoLayout({ children }: { children: ReactNode }) {
  const session = useSession();

  return <EventsShell session={session}>{children}</EventsShell>;
}
