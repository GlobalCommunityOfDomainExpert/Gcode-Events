"use client";

import { useSyncExternalStore } from "react";
import { getSession, Session } from "@/lib/auth/session";

// getSession() reads localStorage, which doesn't exist during SSR — the
// server snapshot is always null, and React re-renders with the real client
// value immediately after hydration. Never notifies (session changes come
// from explicit navigation, not from something this needs to subscribe to).
function subscribe() {
  return () => {};
}

function getServerSnapshot(): Session | null {
  return null;
}

// getSession() builds a new object literal every call — useSyncExternalStore
// requires getSnapshot to return a referentially stable value when nothing
// actually changed, or it re-renders forever trying to "settle". Cache the
// last object and only replace it when the session actually differs.
let cachedKey: string | null = null;
let cachedSession: Session | null = null;

function getSnapshot(): Session | null {
  const session = getSession();
  const key = session
    ? `${session.userId}|${session.roleName}|${session.expiresAt}`
    : null;
  if (key !== cachedKey) {
    cachedKey = key;
    cachedSession = session;
  }
  return cachedSession;
}

export function useSession(): Session | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
