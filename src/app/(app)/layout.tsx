"use client";

import { ReactNode, Suspense, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/hooks/use-session";
import { getSession } from "@/lib/auth/session";

// useSearchParams() requires a Suspense boundary above it or Next.js can't
// statically prerender pages under this layout (build fails outright —
// confirmed against /my-organized-events/new). The gate itself can't wrap
// its own hook call in Suspense, so it's split into an outer boundary +
// inner component that actually reads the params.
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <AppLayoutGate>{children}</AppLayoutGate>
    </Suspense>
  );
}

function AppLayoutGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const session = useSession();

  useEffect(() => {
    // Re-check directly rather than trusting `session` alone — a dev-mode
    // double-effect pass (React Strict Mode) can observe a stale/transient
    // null from the store hook even though the real session is fine, and a
    // false redirect here is far more disruptive than a redundant read.
    // Never bounce the auth pages themselves: if this effect ever runs while
    // pathname is already /sign-in or /sign-up, it would wrap another
    // ?redirect= around the one it just built, recursing forever.
    if (pathname.startsWith("/sign-in") || pathname.startsWith("/sign-up")) {
      return;
    }
    if (!session && !getSession()) {
      // Carry the page they were trying to reach through sign-in — e.g. a
      // panelist invite link — so SignInForm can send them back here
      // instead of defaulting to Home. Same convention as SignInForm's own
      // ?redirect= handling.
      const query = searchParams.toString();
      const destination = query ? `${pathname}?${query}` : pathname;
      router.replace(`/sign-in?redirect=${encodeURIComponent(destination)}`);
    }
  }, [session, router, pathname, searchParams]);

  if (!session) return null;

  return <>{children}</>;
}
