import Image from "next/image";
import NextLink from "next/link";
import { Building2, CalendarCheck, GraduationCap, Handshake, QrCode, Rocket, User, Users } from "lucide-react";

const points = [
  {
    icon: CalendarCheck,
    title: "Hackathons, ideathons, AMAs and webinars",
    text: "Every GCODE event in one place, online and in person.",
  },
  {
    icon: QrCode,
    title: "Tickets in a few taps",
    text: "Reserve a seat, keep your ticket on your phone, check in with a QR.",
  },
  {
    icon: Users,
    title: "Meet the experts behind GCODE",
    text: "Learn from founders, CXOs and domain experts who mentor the community.",
  },
];

// Audience icons, not photos: no real faces on the auth pages
const audiences = [User, Rocket, GraduationCap, Building2, Handshake];

/** Brand panel on the left of every auth page (desktop only). */
export function AuthAside() {
  return (
    <aside className="bg-primary relative hidden overflow-hidden text-white lg:flex lg:flex-col">
      {/* Soft crimson glow + dotted grid, purely decorative */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.14] [background-image:radial-gradient(white_1px,transparent_1px)] [background-size:22px_22px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]"
      />
      <div
        aria-hidden
        className="bg-secondary pointer-events-none absolute -right-40 -bottom-40 size-[520px] rounded-full opacity-30 blur-[120px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -left-24 size-[380px] rounded-full bg-sky-300 opacity-10 blur-[110px]"
      />

      <div className="relative flex flex-1 flex-col justify-between gap-12 p-12 xl:p-16">
        <NextLink href="/" className="w-fit" aria-label="GCODE Events home">
          <Image
            src="/app-logo.png"
            width={132}
            height={57}
            alt="GCODE"
            className="h-12 w-auto object-contain brightness-0 invert"
            priority
          />
        </NextLink>

        <div className="max-w-[460px]">
          <p className="text-small mb-4 font-semibold tracking-[0.14em] text-white/60 uppercase">
            GCODE Events
          </p>
          <h2 className="text-[2.6rem] leading-[1.1] font-bold tracking-[-0.02em] text-balance">
            Where builders meet the people who&apos;ve done it before.
          </h2>

          <ul className="mt-10 flex flex-col gap-6">
            {points.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-white/10 ring-1 ring-white/15">
                  <Icon className="size-5" aria-hidden />
                </span>
                <span>
                  <span className="text-body block font-semibold">{title}</span>
                  <span className="text-small block text-white/65">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-center gap-4 rounded-md bg-white/[0.06] p-4 ring-1 ring-white/10 backdrop-blur-sm">
          <div className="flex -space-x-2.5">
            {audiences.map((AudienceIcon, i) => (
              <span
                key={i}
                className="text-primary ring-primary flex size-10 items-center justify-center rounded-full bg-white ring-2"
              >
                <AudienceIcon className="size-5" aria-hidden />
              </span>
            ))}
          </div>
          <p className="text-small text-white/75">
            For experts, startups, interns, institutions and{" "}
            <span className="font-semibold text-white">partners</span>.
          </p>
        </div>
      </div>
    </aside>
  );
}
