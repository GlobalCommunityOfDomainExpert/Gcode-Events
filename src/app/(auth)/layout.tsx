import { ReactNode } from "react";
import Image from "next/image";
import NextLink from "next/link";
import { ArrowLeft, CalendarDays } from "lucide-react";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { AuthAside } from "./_components/auth-aside";

/** GCODE marketing site (the main landing page). */
const LANDING_URL = "https://gcode.in";

const navLink =
  "text-text-secondary hover:text-text-primary hover:bg-bg-subtle inline-flex items-center gap-1.5 rounded-sm px-2 py-1.5 transition-colors";

/** Full-page auth screens: brand panel on the left, form on the right. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <GoogleOAuthProvider
      clientId={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? ""}
    >
      <div className="grid min-h-svh lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <AuthAside />

        <main className="bg-surface-light flex min-h-svh flex-col">
          <header className="flex items-center justify-between gap-4 px-6 py-5 sm:px-10">
            <NextLink href="/" className="lg:hidden" aria-label="GCODE Events home">
              <Image
                src="/gcode-logo-black.png"
                width={120}
                height={52}
                alt="GCODE"
                className="h-11 w-auto object-contain"
                priority
              />
            </NextLink>
            <nav
              aria-label="Leave sign-in"
              className="text-small ml-auto flex items-center gap-1 font-medium sm:gap-2"
            >
              <NextLink href="/" className={navLink}>
                <CalendarDays className="size-4" aria-hidden />
                Browse events
              </NextLink>
              <span aria-hidden className="bg-border-light h-4 w-px" />
              <a href={LANDING_URL} className={navLink}>
                <ArrowLeft className="size-4" aria-hidden />
                <span className="sm:hidden">Home</span>
                <span className="hidden sm:inline">Back to gcode.in</span>
              </a>
            </nav>
          </header>

          <div className="flex flex-1 items-center justify-center px-6 py-8 sm:px-10">
            <div className="w-full max-w-[440px]">{children}</div>
          </div>

          <footer className="text-small text-text-secondary px-6 py-5 text-center sm:px-10">
            © {new Date().getFullYear()} GCODE · Global Community of Domain Experts
          </footer>
        </main>
      </div>
    </GoogleOAuthProvider>
  );
}
