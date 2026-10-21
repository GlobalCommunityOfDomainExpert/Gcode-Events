"use server";

import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  CLIENT_DASHBOARD_PASSWORD,
  isDashboardEvent,
} from "@/lib/client-dashboard/config";
import {
  SESSION_MAX_AGE_SECONDS,
  cookieName,
  createSessionValue,
} from "@/lib/client-dashboard/session";

export interface LoginState {
  error?: string;
}

function passwordMatches(input: string): boolean {
  const a = Buffer.from(input);
  const b = Buffer.from(CLIENT_DASHBOARD_PASSWORD);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const eventId = String(formData.get("eventId") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!isDashboardEvent(eventId)) return { error: "Unknown event." };
  if (!passwordMatches(password)) return { error: "Incorrect password." };

  (await cookies()).set(cookieName(eventId), createSessionValue(eventId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: `/client/${eventId}`,
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  redirect(`/client/${eventId}`);
}

export async function logoutAction(formData: FormData): Promise<void> {
  const eventId = String(formData.get("eventId") ?? "");
  if (!isDashboardEvent(eventId)) return;
  (await cookies()).delete({
    name: cookieName(eventId),
    path: `/client/${eventId}`,
  });
  redirect(`/client/${eventId}/login`);
}
