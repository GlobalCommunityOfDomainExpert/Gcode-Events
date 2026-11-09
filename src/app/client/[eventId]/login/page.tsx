import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { isDashboardEvent } from "@/lib/client-dashboard/config";
import { cookieName, verifySessionValue } from "@/lib/client-dashboard/session";
import { LoginForm } from "./login-form";

export const metadata = { title: "Client Login" };

export default async function ClientLoginPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  if (!isDashboardEvent(eventId)) notFound();

  const token = (await cookies()).get(cookieName(eventId))?.value;
  if (verifySessionValue(token, eventId)) redirect(`/client/${eventId}`);

  return (
    <main className="bg-bg-light flex min-h-screen items-center justify-center px-4">
      <div className="border-border-light bg-surface-light w-full max-w-sm rounded-md border p-6 shadow-md">
        <h1 className="text-heading text-text-primary font-extrabold">
          Client Dashboard
        </h1>
        <p className="text-small text-text-secondary mt-1 mb-6">
          Enter the password to view your event&apos;s numbers.
        </p>
        <LoginForm eventId={eventId} />
      </div>
    </main>
  );
}
