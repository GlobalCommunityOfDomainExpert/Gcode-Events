"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AppShell } from "./app-shell";
import { Navbar, NavLink } from "./navbar";
import { Sidebar, SidebarLink } from "./sidebar";
import {
  CalendarCheck,
  CalendarPlus,
  LayoutDashboard,
  LayoutGrid,
  PencilLine,
  Receipt,
  Settings,
  Tag,
  Ticket,
  Trophy,
  UserCheck,
  Users,
} from "lucide-react";
import { OrganizerNavEvent, useOrganizerNav } from "@/hooks/use-organizer-nav";
import { useSidebarOpen } from "@/hooks/use-sidebar-open";
import { ProfileMenu, ProfileMenuUser } from "@/components/molecules";
import { clearSession, isAdmin, Session } from "@/lib/auth/session";
import { initials } from "@/lib/auth/format";

// "My Events" only shown to admins (Attending/Organizing) — hidden for
// everyone else for now, including signed-in non-admins.
function buildEventsNavLinks(session: Session | null): NavLink[] {
  const base: NavLink[] = [
    { label: "Home", href: "https://gcode.in" },
    { label: "Events", href: "/events" },
  ];
  if (!session || !isAdmin(session)) return base;
  return [
    ...base,
    {
      label: "My Events",
      children: [
        { label: "Attending", href: "/my-events" },
        { label: "Organizing", href: "/my-organized-events" },
      ],
    },
  ];
}

const ORGANIZER_ROOT = "/my-organized-events";

// Organizer area gets the sidebar, except the focused create/edit flows.
function organizerRoute(pathname: string): { show: boolean; eventId?: string } {
  if (!pathname.startsWith(ORGANIZER_ROOT)) return { show: false };
  const rest = pathname.slice(ORGANIZER_ROOT.length).split("/").filter(Boolean);
  if (rest[0] === "new") return { show: false };
  if (rest[1] === "edit") return { show: false };
  return { show: true, eventId: rest[0] };
}

function buildOrganizerLinks(
  eventId: string | undefined,
  nav: OrganizerNavEvent | null,
): SidebarLink[] {
  const top: SidebarLink[] = [
    {
      label: "Your events",
      href: ORGANIZER_ROOT,
      icon: LayoutGrid,
      groupLabel: "Organizing",
    },
    {
      label: "Host an event",
      href: `${ORGANIZER_ROOT}/new`,
      icon: CalendarPlus,
    },
  ];
  const account: SidebarLink[] = [
    {
      label: "Attending",
      href: "/my-events",
      icon: Ticket,
      groupLabel: "Account",
    },
    { label: "Browse events", href: "/events", icon: CalendarCheck },
  ];
  // Only show an event's sections while its own page is open, so a stale
  // value from the previous event never leaks another event's links.
  if (!eventId || !nav || nav.id !== eventId) return [...top, ...account];

  const base = `${ORGANIZER_ROOT}/${eventId}`;
  // Sections follow the event type: judging for competitive formats, money
  // tools only when something is paid.
  const tools = nav.tools ?? { judging: nav.showRounds, money: true };
  const event: SidebarLink[] = [
    {
      label: "Overview",
      href: base,
      icon: LayoutDashboard,
      groupLabel: "This event",
    },
    { label: "Edit details", href: `${base}/edit`, icon: PencilLine },
    {
      label: "Attendees",
      href: `${base}/attendees`,
      icon: Users,
      groupLabel: "People",
      badge: String(nav.attendeeCount),
    },
    {
      label: tools.judging ? "Judges & panelists" : "Panelists",
      href: `${base}/panelists`,
      icon: UserCheck,
    },
    ...(tools.judging
      ? ([
          {
            label: "Rounds & judging",
            href: `${base}/rounds`,
            icon: Trophy,
            groupLabel: "Run the event",
            badge: nav.roundsCount ? String(nav.roundsCount) : undefined,
          },
        ] as SidebarLink[])
      : []),
    ...(tools.money
      ? ([
          {
            label: "UPI claims",
            href: `${base}/upi-claims`,
            icon: Receipt,
            groupLabel: "Money",
            badge:
              nav.pendingClaims > 0 ? String(nav.pendingClaims) : undefined,
          },
          { label: "Coupons", href: `${base}/coupons`, icon: Tag },
        ] as SidebarLink[])
      : []),
    {
      label: "Settings",
      href: `${base}/settings`,
      icon: Settings,
      groupLabel: "Manage",
    },
  ];
  return [
    {
      label: "All events",
      href: ORGANIZER_ROOT,
      icon: LayoutGrid,
      groupLabel: "Organizing",
    },
    ...event,
    ...account,
  ];
}

export interface EventsShellProps {
  session: Session | null;
  children: ReactNode;
}

export function EventsShell({ session, children }: EventsShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const links = buildEventsNavLinks(session);
  const [sidebarOpen, toggleSidebar] = useSidebarOpen();
  const organizerNav = useOrganizerNav();
  const transparent = pathname === "/events";

  if (!session) {
    return (
      <AppShell
        navbar={
          <Navbar
            links={links}
            ctaLabel="Register"
            onCtaClick={() => router.push("/sign-up")}
            secondaryCtaLabel="Sign In"
            onSecondaryCtaClick={() => router.push("/sign-in")}
            transparent={transparent}
          />
        }
        sidebar={null}
      >
        <div className={transparent ? "" : "mt-10"}>{children}</div>
      </AppShell>
    );
  }

  const user: ProfileMenuUser = {
    name: session.fullName,
    role: session.roleName,
    avatarInitials: initials(session.fullName),
  };

  function handleLogout() {
    clearSession();
    router.push("/sign-in");
  }

  const route = organizerRoute(pathname);
  const showSidebar = route.show && isAdmin(session);
  const sidebarLinks = showSidebar
    ? buildOrganizerLinks(route.eventId, organizerNav)
    : [];

  return (
    <AppShell
      sidebarCompact={!sidebarOpen}
      sidebar={
        showSidebar ? (
          <Sidebar variant="bare" links={sidebarLinks} compact={!sidebarOpen} />
        ) : undefined
      }
      navbar={
        <Navbar
          links={links}
          hasUnreadNotifications
          sidebarToggle={
            showSidebar
              ? { open: sidebarOpen, onToggle: toggleSidebar }
              : undefined
          }
          transparent={transparent}
          accountMenu={
            <div className="flex items-center gap-4">
              {isAdmin(session) && (
                <Link
                  href="/my-organized-events/new"
                  className="text-body focus-visible:ring-offset-primary font-medium whitespace-nowrap text-white/90 transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:outline-none"
                >
                  + Host Event
                </Link>
              )}
              <ProfileMenu
                variant="navbar"
                user={user}
                onViewProfile={() => router.push("/profile")}
                onLogout={handleLogout}
              />
            </div>
          }
          mobileFooter={
            <div className="space-y-3 p-3">
              {showSidebar && <Sidebar variant="bare" links={sidebarLinks} />}
              {isAdmin(session) && (
                <Link
                  href="/my-organized-events/new"
                  className="text-body text-primary block font-medium"
                >
                  + Host Event
                </Link>
              )}
              <ProfileMenu
                variant="sidebar"
                user={user}
                onViewProfile={() => router.push("/profile")}
                onLogout={handleLogout}
              />
            </div>
          }
        />
      }
    >
      <div className={transparent ? "" : "mt-10"}>{children}</div>
    </AppShell>
  );
}
