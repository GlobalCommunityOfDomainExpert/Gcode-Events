import Image from "next/image";
import Link from "next/link";
import {
  GitHubIcon,
  InstagramIcon,
  LinkedInIcon,
  XIcon as TwitterIcon,
} from "@/components/molecules/social-icon";

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
              links={[
                { label: "About Us", href: "/about-us" },
                { label: "Contact Us", href: "/contact-us" },
              ]}
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
