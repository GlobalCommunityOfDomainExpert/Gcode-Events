"use client";

import { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck } from "lucide-react";
import { AppShell } from "./app-shell";
import { Navbar } from "./navbar";
import { Sidebar, SidebarLink } from "./sidebar";
import { isAdmin, Session } from "@/lib/auth/session";
import { signOut } from "@/lib/api/auth";
import { initials } from "@/lib/auth/format";

function buildSidebarLinks(session: Session): SidebarLink[] {
  if (isAdmin(session)) {
    return [
      {
        label: "My Events",
        icon: CalendarCheck,
        children: [
          { label: "Attending", href: "/my-events" },
          { label: "Organizing", href: "/my-organized-events" },
        ],
      },
    ];
  }
  return [{ label: "My Events", icon: CalendarCheck, href: "/my-events" }];
}

export interface AuthedShellProps {
  session: Session;
  children: ReactNode;
}

export function AuthedShell({ session, children }: AuthedShellProps) {
  const router = useRouter();
  const sidebarLinks = buildSidebarLinks(session);

  const sidebarUser = {
    name: session.fullName,
    role: session.roleName,
    avatarInitials: initials(session.fullName),
  };

  async function handleLogout() {
    await signOut();
    router.push("/sign-in");
  }

  return (
    <AppShell
      navbar={
        <Navbar
          ctaLabel="Problem Feed"
          hasUnreadNotifications
          mobileFooter={
            <Sidebar
              variant="bare"
              links={sidebarLinks}
              user={sidebarUser}
              profileCompletion={100}
              onLogout={handleLogout}
            />
          }
        />
      }
      sidebar={
        <Sidebar
          links={sidebarLinks}
          user={sidebarUser}
          profileCompletion={100}
          onLogout={handleLogout}
        />
      }
    >
      {children}
    </AppShell>
  );
}
