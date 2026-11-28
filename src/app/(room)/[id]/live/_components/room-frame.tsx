import Link from "next/link";
import { ReactNode } from "react";
import { withBasePath } from "@/lib/base-path";

// The room's look, copied from the advisory app's call room so a 1:1 call
// and a webinar feel like one product: a full-screen navy gradient, no app
// chrome, a slim header (wordmark · what this is · optional status).
export function RoomFrame({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="from-primary to-primary-hover flex min-h-screen flex-col bg-linear-to-br text-white">
      <header className="flex items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link href="/" className="shrink-0" aria-label="GCODE Events">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={withBasePath("/app-logo.png")} alt="GCODE" className="h-8 w-auto" />
        </Link>
        <p className="text-small hidden min-w-0 truncate text-white/70 sm:block">
          {title}
          {subtitle && ` · ${subtitle}`}
        </p>
        {right ?? <span />}
      </header>
      {children}
    </div>
  );
}

/** A message in the room: a narrow column on the left of a wide page. */
export function RoomPanel({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto grid w-full max-w-5xl flex-1 items-center px-4 pb-10 sm:px-6">
      <div className="max-w-xl space-y-4">{children}</div>
    </main>
  );
}

// The advisory room's two button styles on the dark background.
export const btnLight =
  "inline-flex h-11 items-center justify-center gap-2 rounded-sm bg-white px-5 text-sm font-semibold text-primary shadow-sm transition-colors hover:bg-white/90 disabled:opacity-50";
export const btnOnDark =
  "inline-flex h-9 items-center justify-center gap-2 rounded-sm border border-white/25 px-3 text-sm font-semibold text-white transition-colors hover:bg-white/10";
