import { SVGProps } from "react";
import { Globe } from "lucide-react";

// This lucide-react build dropped brand icons, so these are small local
// marks. `detectSocial` picks one from the organizer's platform text or the
// URL itself, falling back to a globe for plain websites.

type SvgIcon = (props: SVGProps<SVGSVGElement>) => React.ReactElement;

const fill = (d: string): SvgIcon =>
  function BrandIcon(props) {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
        <path d={d} />
      </svg>
    );
  };

export const XIcon = fill(
  "M18.9 2h3.3l-7.2 8.2L23.4 22h-6.6l-5.2-6.8L5.6 22H2.3l7.7-8.8L1.6 2h6.8l4.7 6.2L18.9 2Zm-1.2 18h1.8L7.4 4H5.5l12.2 16Z",
);
export const LinkedInIcon = fill(
  "M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9h4v12H3V9Zm7 0h3.8v1.7h.05c.53-1 1.83-2 3.77-2 4.03 0 4.78 2.65 4.78 6.1V21h-4v-5.6c0-1.34-.02-3.06-1.87-3.06-1.87 0-2.16 1.46-2.16 2.96V21h-4V9Z",
);
export const GitHubIcon = fill(
  "M12 2C6.48 2 2 6.58 2 12.2c0 4.5 2.87 8.32 6.84 9.67.5.1.68-.22.68-.49 0-.24-.01-1.04-.01-1.89-2.78.61-3.37-1.2-3.37-1.2-.45-1.18-1.11-1.49-1.11-1.49-.91-.63.07-.62.07-.62 1 .07 1.53 1.05 1.53 1.05.9 1.55 2.36 1.1 2.94.84.09-.66.35-1.1.64-1.36-2.22-.26-4.56-1.13-4.56-5.03 0-1.11.39-2.02 1.03-2.73-.1-.26-.45-1.3.1-2.7 0 0 .84-.27 2.75 1.05a9.3 9.3 0 0 1 5 0c1.9-1.32 2.75-1.05 2.75-1.05.55 1.4.2 2.44.1 2.7.64.71 1.03 1.62 1.03 2.73 0 3.91-2.34 4.77-4.57 5.02.36.32.68.94.68 1.9 0 1.37-.01 2.48-.01 2.81 0 .27.18.6.69.49A10.02 10.02 0 0 0 22 12.2C22 6.58 17.52 2 12 2Z",
);
export const YouTubeIcon = fill(
  "M23 7.2a3 3 0 0 0-2.1-2.1C19 4.6 12 4.6 12 4.6s-7 0-8.9.5A3 3 0 0 0 1 7.2 31 31 0 0 0 .5 12a31 31 0 0 0 .5 4.8 3 3 0 0 0 2.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 0 0 2.1-2.1 31 31 0 0 0 .5-4.8 31 31 0 0 0-.5-4.8ZM9.75 15.02V8.98L15.5 12l-5.75 3.02Z",
);
export const FacebookIcon = fill(
  "M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.69.24 2.69.24v2.97h-1.52c-1.49 0-1.96.93-1.96 1.89v2.26h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07Z",
);
export const DiscordIcon = fill(
  "M20.32 4.37A19.8 19.8 0 0 0 15.4 2.8l-.62 1.27a18.3 18.3 0 0 0-5.56 0L8.6 2.8a19.7 19.7 0 0 0-4.93 1.57C.55 9.05-.3 13.6.12 18.1a19.9 19.9 0 0 0 6.04 3.05l1.3-2.11a12.9 12.9 0 0 1-2.05-.98l.5-.39a14.2 14.2 0 0 0 12.18 0l.5.39c-.65.39-1.34.72-2.05.98l1.3 2.11a19.8 19.8 0 0 0 6.04-3.05c.5-5.22-.84-9.73-3.56-13.73ZM8.02 15.33c-1.18 0-2.16-1.08-2.16-2.42s.95-2.42 2.16-2.42 2.18 1.09 2.16 2.42c0 1.34-.96 2.42-2.16 2.42Zm7.96 0c-1.18 0-2.16-1.08-2.16-2.42s.95-2.42 2.16-2.42 2.18 1.09 2.16 2.42c0 1.34-.95 2.42-2.16 2.42Z",
);
export const WhatsAppIcon = fill(
  "M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.3 14.2c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.6-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.9s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.3 0 .5l-.3.5-.4.4c-.1.1-.3.3-.1.6.2.3.7 1.2 1.6 2 1.1 1 2 1.3 2.3 1.4.3.1.5.1.6-.1l.9-1.1c.2-.3.4-.2.6-.1l1.9.9c.3.1.5.2.5.3.1.2.1.7-.1 1.4Z",
);
export const TelegramIcon = fill(
  "M21.9 4.3 18.6 20c-.2 1.1-.9 1.4-1.8.9l-5-3.7-2.4 2.3c-.3.3-.5.5-1 .5l.4-5.1 9.2-8.3c.4-.4-.1-.6-.6-.2L6 13.6l-4.9-1.5c-1.1-.3-1.1-1.1.2-1.6l19.2-7.4c.9-.3 1.7.2 1.4 1.2Z",
);
export function InstagramIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden
      {...props}
    >
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}
function WebsiteIcon(props: SVGProps<SVGSVGElement>) {
  return <Globe aria-hidden {...(props as object)} />;
}

export interface SocialBrand {
  key: string;
  label: string;
  icon: SvgIcon;
  /** Brand colour, used on hover. */
  color: string;
}

const BRANDS: (SocialBrand & { match: RegExp })[] = [
  {
    key: "x",
    label: "X (Twitter)",
    icon: XIcon,
    color: "#000000",
    match: /(^|\W)(x|twitter)(\W|$)|twitter\.com|(^|\.)x\.com/i,
  },
  {
    key: "linkedin",
    label: "LinkedIn",
    icon: LinkedInIcon,
    color: "#0A66C2",
    match: /linkedin/i,
  },
  {
    key: "instagram",
    label: "Instagram",
    icon: InstagramIcon,
    color: "#E1306C",
    match: /instagram|instagr\.am/i,
  },
  {
    key: "youtube",
    label: "YouTube",
    icon: YouTubeIcon,
    color: "#FF0000",
    match: /youtube|youtu\.be/i,
  },
  {
    key: "github",
    label: "GitHub",
    icon: GitHubIcon,
    color: "#181717",
    match: /github/i,
  },
  {
    key: "discord",
    label: "Discord",
    icon: DiscordIcon,
    color: "#5865F2",
    match: /discord/i,
  },
  {
    key: "whatsapp",
    label: "WhatsApp",
    icon: WhatsAppIcon,
    color: "#25D366",
    match: /whatsapp|wa\.me/i,
  },
  {
    key: "telegram",
    label: "Telegram",
    icon: TelegramIcon,
    color: "#26A5E4",
    match: /telegram|t\.me\//i,
  },
  {
    key: "facebook",
    label: "Facebook",
    icon: FacebookIcon,
    color: "#1877F2",
    match: /facebook|fb\.com|fb\.me/i,
  },
];

const WEBSITE: SocialBrand = {
  key: "website",
  label: "Website",
  icon: WebsiteIcon,
  color: "var(--color-primary)",
};

export function detectSocial(platform: string, url: string): SocialBrand {
  const text = `${platform} ${url}`;
  const hit = BRANDS.find((b) => b.match.test(text));
  if (hit) return hit;
  return { ...WEBSITE, label: platform.trim() || WEBSITE.label };
}
