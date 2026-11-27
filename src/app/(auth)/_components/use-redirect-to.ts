"use client";

import { useSearchParams } from "next/navigation";

/**
 * Where to land after auth, from ?redirect= (e.g. a panelist invite link sends
 * people to /sign-in?redirect=/panelist-invites/24). Only a same-app relative
 * path is accepted: never an absolute or protocol-relative ("//host") URL,
 * which would be an open redirect.
 */
export function useRedirectTo(): string {
  const value = useSearchParams().get("redirect");
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

/** Appends ?redirect= to an auth link, unless it is just "/". */
export function withRedirect(href: string, redirectTo: string): string {
  return redirectTo === "/"
    ? href
    : `${href}?redirect=${encodeURIComponent(redirectTo)}`;
}
