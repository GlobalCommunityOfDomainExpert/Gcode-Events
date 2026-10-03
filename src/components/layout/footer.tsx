import { SVGProps } from "react";
import Image from "next/image";
import Link from "next/link";

// This lucide-react build dropped brand/social icons, so these are small
// local placeholders — swap for real brand assets whenever social links go live.
function TwitterIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M18.9 2h3.3l-7.2 8.2L23.4 22h-6.6l-5.2-6.8L5.6 22H2.3l7.7-8.8L1.6 2h6.8l4.7 6.2L18.9 2Zm-1.2 18h1.8L7.4 4H5.5l12.2 16Z" />
    </svg>
  );
}

function LinkedInIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9h4v12H3V9Zm7 0h3.8v1.7h.05c.53-1 1.83-2 3.77-2 4.03 0 4.78 2.65 4.78 6.1V21h-4v-5.6c0-1.34-.02-3.06-1.87-3.06-1.87 0-2.16 1.46-2.16 2.96V21h-4V9Z" />
    </svg>
  );
}

function InstagramIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      {...props}
    >
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function GitHubIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 2C6.48 2 2 6.58 2 12.2c0 4.5 2.87 8.32 6.84 9.67.5.1.68-.22.68-.49 0-.24-.01-1.04-.01-1.89-2.78.61-3.37-1.2-3.37-1.2-.45-1.18-1.11-1.49-1.11-1.49-.91-.63.07-.62.07-.62 1 .07 1.53 1.05 1.53 1.05.9 1.55 2.36 1.1 2.94.84.09-.66.35-1.1.64-1.36-2.22-.26-4.56-1.13-4.56-5.03 0-1.11.39-2.02 1.03-2.73-.1-.26-.45-1.3.1-2.7 0 0 .84-.27 2.75 1.05a9.3 9.3 0 0 1 5 0c1.9-1.32 2.75-1.05 2.75-1.05.55 1.4.2 2.44.1 2.7.64.71 1.03 1.62 1.03 2.73 0 3.91-2.34 4.77-4.57 5.02.36.32.68.94.68 1.9 0 1.37-.01 2.48-.01 2.81 0 .27.18.6.69.49A10.02 10.02 0 0 0 22 12.2C22 6.58 17.52 2 12 2Z"
      />
    </svg>
  );
}

const socialLinks = [
  { label: "Twitter / X", href: "#", icon: TwitterIcon },
  { label: "LinkedIn", href: "#", icon: LinkedInIcon },
  { label: "Instagram", href: "#", icon: InstagramIcon },
  { label: "GitHub", href: "#", icon: GitHubIcon },
];

interface FooterLink {
  label: string;
  href: string;
}

function FooterLinkGroup({
  title,
  links,
}: {
  title: string;
  links: FooterLink[];
}) {
  return (
    <div>
      <p className="text-small text-text-secondary mb-2 font-semibold tracking-wide uppercase">
        {title}
      </p>
      <ul className="space-y-1">
        {links.map((link) => (
          <li key={link.label}>
            <Link
              href={link.href}
              className="text-small text-text-secondary hover:text-text-primary"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="border-border-light bg-surface-light mt-20 border-t">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-8 sm:flex-row sm:justify-between">
          <div className="max-w-xs space-y-3">
            <Image
              src="/gcode-logo-black.png"
              width={120}
              height={24}
              alt="GCODE"
              className="object-contain"
            />
            <p className="text-small text-text-secondary">
              Connecting the GCODE community through events, mentoring, and
              shared problem-solving.
            </p>
            <div className="flex gap-3">
              {socialLinks.map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  aria-label={social.label}
                  className="border-border-light bg-bg-light text-text-secondary hover:text-text-primary hover:border-border-hover flex size-8 items-center justify-center rounded-full border transition-colors"
                >
                  <social.icon className="size-4" />
                </a>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-8 sm:gap-16">
            <FooterLinkGroup
              title="Explore"
              links={[{ label: "Events", href: "/events" }]}
            />
            <FooterLinkGroup
              title="Company"
              links={[{ label: "Contact Us", href: "/contact-us" }]}
            />
            <FooterLinkGroup
              title="Legal"
              links={[
                { label: "Terms & Conditions", href: "/terms-and-conditions" },
                { label: "Privacy Policy", href: "/privacy-policy" },
                { label: "Refund Policy", href: "/refund-policy" },
              ]}
            />
          </div>
        </div>
      </div>

      <div className="border-border-light border-t px-4 py-4 sm:px-6 lg:px-8">
        <p className="text-small text-text-secondary text-center">
          © {new Date().getFullYear()} GCODE. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
