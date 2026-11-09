"use client";

import { ReactNode, useState } from "react";
import { Check, Copy, Link2, Mail, MessageCircle, Share2 } from "lucide-react";
import { Button, Card, Icon, SectionLabel } from "@/components/atoms";
import { Modal } from "@/components/molecules";

interface ShareEventCardProps {
  url: string;
  title: string;
  /** Date line for the default message, e.g. "Sun 15 – Mon 16 Nov 2026". */
  dateLabel?: string;
  /** Place for the default message, e.g. venue name or "Online". */
  place?: string;
  /** Used for the link preview when the page has no og:image yet. */
  imageUrl?: string;
  tellMeMoreButton?: ReactNode;
  // Rendered next to the Share button — the event page passes the
  // event enquiry and "I'm Interested" buttons here so the actions stay together.
  interestButton?: ReactNode;
  /** Render just the action row (no card or heading) — for embedding in another card. */
  bare?: boolean;
  /** Text-only buttons, no borders (bare only). */
  plain?: boolean;
}

interface LinkPreview {
  image?: string;
  title: string;
  description?: string;
  domain: string;
}

// WhatsApp/Facebook/LinkedIn cache link previews per exact URL, so a stale
// scrape sticks for weeks. A fresh ?v= on every share forces a re-scrape.
function withShareVersion(url: string): string {
  const u = new URL(url, window.location.origin);
  u.searchParams.set("v", Math.random().toString(36).slice(2, 8));
  return u.toString();
}

// Reads the page's own og:* tags (set by the event layout + opengraph-image
// route), so the preview is exactly what WhatsApp/LinkedIn will scrape.
function readLinkPreview(fallback: {
  title: string;
  image?: string;
  url: string;
}): LinkPreview {
  const meta = (property: string) =>
    document
      .querySelector<HTMLMetaElement>(`meta[property="${property}"]`)
      ?.content.trim() || undefined;
  const ogUrl = meta("og:url") ?? fallback.url;
  let domain = "";
  try {
    domain = new URL(ogUrl, window.location.origin).host;
  } catch {
    domain = window.location.host;
  }
  return {
    image: meta("og:image") ?? fallback.image,
    title: meta("og:title") ?? fallback.title,
    description: meta("og:description"),
    domain,
  };
}

function defaultMessage(title: string, dateLabel?: string, place?: string) {
  const when = [dateLabel, place].filter(Boolean).join(" · ");
  return [`Join me at ${title}!`, when, "Register here:"]
    .filter(Boolean)
    .join("\n");
}

export function ShareEventCard({
  url,
  title,
  dateLabel,
  place,
  imageUrl,
  tellMeMoreButton,
  interestButton,
  bare = false,
  plain = false,
}: ShareEventCardProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<"link" | "message" | null>(null);
  const [preview, setPreview] = useState<LinkPreview | null>(null);
  const [message, setMessage] = useState(() =>
    defaultMessage(title, dateLabel, place),
  );
  const canNativeShare =
    typeof navigator !== "undefined" && "share" in navigator;

  function openModal() {
    setPreview(readLinkPreview({ title, image: imageUrl, url }));
    setOpen(true);
  }

  const text = message.trim();
  const fullMessage = (link: string) => (text ? `${text}\n${link}` : link);

  async function copy(kind: "link" | "message") {
    const link = withShareVersion(url);
    try {
      await navigator.clipboard.writeText(
        kind === "link" ? link : fullMessage(link),
      );
      setCopied(kind);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // clipboard unavailable — no-op
    }
  }

  async function handleNativeShare() {
    try {
      await navigator.share({ title, text, url: withShareVersion(url) });
    } catch {
      // user cancelled or unsupported — no-op
    }
  }

  function openShareWindow(shareUrl: string) {
    window.open(shareUrl, "_blank", "noopener,noreferrer");
  }

  const channels: {
    label: string;
    badge: ReactNode;
    tone: string;
    href: () => string;
  }[] = [
    {
      label: "WhatsApp",
      badge: <Icon icon={MessageCircle} size="sm" />,
      tone: "bg-[#25D366] text-white",
      href: () =>
        `https://wa.me/?text=${encodeURIComponent(fullMessage(withShareVersion(url)))}`,
    },
    {
      label: "LinkedIn",
      badge: <span className="text-[13px] font-bold">in</span>,
      tone: "bg-[#0A66C2] text-white",
      href: () =>
        `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(withShareVersion(url))}`,
    },
    {
      label: "X",
      badge: <span className="text-[13px] font-bold">X</span>,
      tone: "bg-black text-white",
      href: () =>
        `https://twitter.com/intent/tweet?url=${encodeURIComponent(withShareVersion(url))}&text=${encodeURIComponent(text || title)}`,
    },
    {
      label: "Facebook",
      badge: <span className="text-[15px] font-bold">f</span>,
      tone: "bg-[#1877F2] text-white",
      href: () =>
        `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(withShareVersion(url))}`,
    },
    {
      label: "Email",
      badge: <Icon icon={Mail} size="sm" />,
      tone: "bg-bg-subtle text-text-primary",
      href: () =>
        `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(fullMessage(withShareVersion(url)))}`,
    },
    {
      label: "Reddit",
      badge: <span className="text-[12px] font-bold">r/</span>,
      tone: "bg-[#FF4500] text-white",
      href: () =>
        `https://www.reddit.com/submit?url=${encodeURIComponent(withShareVersion(url))}&title=${encodeURIComponent(title)}`,
    },
  ];

  return (
    <>
      {bare ? (
        <div className="flex flex-wrap items-center gap-1">
          <Button
            variant={plain ? "ghost" : "secondary"}
            size="sm"
            className={
              plain
                ? "!text-text-secondary hover:!bg-bg-light hover:!text-text-primary !px-2 font-medium"
                : ""
            }
            onClick={openModal}
          >
            <Icon icon={Share2} size="sm" />
            Share
          </Button>
          {tellMeMoreButton}
          {interestButton}
        </div>
      ) : (
        <Card className="space-y-3">
          <SectionLabel>Share Event</SectionLabel>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={openModal}>
              <Icon icon={Share2} size="sm" />
              Share
            </Button>
            {tellMeMoreButton}
            {interestButton}
          </div>
        </Card>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Share event"
        size="lg"
        bodyClassName="p-0"
      >
        <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {/* ------------------------------------------------ preview */}
          <div className="bg-bg-light border-border-light flex flex-col border-b p-6 md:border-r md:border-b-0">
            <p className="text-text-secondary text-xs font-semibold tracking-wider uppercase">
              Preview
            </p>
            <p className="text-text-secondary mt-0.5 text-xs">
              How your message appears in chats
            </p>

            <div className="mt-5 flex flex-1 items-start justify-end">
              <div className="bg-surface-light border-border-light w-full max-w-[20rem] rounded-xl rounded-tr-sm border p-1.5 shadow-sm">
                {/* link card — mirrors the og:* tags crawlers read */}
                <div className="bg-bg-light overflow-hidden rounded-lg">
                  {preview?.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={preview.image}
                      alt=""
                      className="aspect-[1200/630] w-full object-cover"
                    />
                  ) : (
                    <div className="bg-bg-subtle aspect-[1200/630] w-full" />
                  )}
                  <div className="px-3 py-2.5">
                    <p className="text-small text-text-primary line-clamp-2 leading-snug font-semibold">
                      {preview?.title ?? title}
                    </p>
                    {preview?.description && (
                      <p className="text-text-secondary mt-1 line-clamp-2 text-xs leading-snug">
                        {preview.description}
                      </p>
                    )}
                    <p className="text-text-secondary/80 mt-1.5 text-[11px] tracking-wide lowercase">
                      {preview?.domain}
                    </p>
                  </div>
                </div>

                {/* message body */}
                <p className="text-small text-text-primary px-2 pt-2 leading-relaxed break-words whitespace-pre-wrap">
                  {text && `${text}\n`}
                  <span className="text-primary underline underline-offset-2">
                    {url}
                  </span>
                </p>
                <p className="text-text-secondary px-2 pt-0.5 pb-1 text-right text-[10px]">
                  now
                </p>
              </div>
            </div>
          </div>

          {/* ------------------------------------------------ compose + send */}
          <div className="space-y-5 p-6">
            <div>
              <div className="flex items-center justify-between">
                <label
                  htmlFor="share-message"
                  className="text-small text-text-primary font-semibold"
                >
                  Message
                </label>
                <button
                  type="button"
                  onClick={() => copy("message")}
                  className="text-primary inline-flex items-center gap-1 text-xs font-semibold hover:underline"
                >
                  <Icon
                    icon={copied === "message" ? Check : Copy}
                    size="sm"
                    className="size-3.5"
                  />
                  {copied === "message" ? "Copied" : "Copy message"}
                </button>
              </div>
              <textarea
                id="share-message"
                rows={4}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="border-border-light bg-surface-light text-small text-text-primary focus:border-primary focus:ring-primary/15 mt-2 w-full resize-none rounded-sm border px-3 py-2 leading-relaxed outline-none focus:ring-4"
              />
              <p className="text-text-secondary mt-1 text-xs">
                The event link is added at the end.
              </p>
            </div>

            <div>
              <p className="text-small text-text-primary font-semibold">Link</p>
              <div className="border-border-light bg-bg-light mt-2 flex items-center gap-2 rounded-sm border py-1 pr-1 pl-3">
                <Icon
                  icon={Link2}
                  size="sm"
                  className="text-text-secondary shrink-0"
                />
                <span className="text-small text-text-secondary min-w-0 flex-1 truncate">
                  {url.replace(/^https?:\/\//, "")}
                </span>
                <Button
                  variant="secondary"
                  size="xs"
                  onClick={() => copy("link")}
                >
                  <Icon
                    icon={copied === "link" ? Check : Copy}
                    size="sm"
                    className="size-3.5"
                  />
                  {copied === "link" ? "Copied" : "Copy"}
                </Button>
              </div>
            </div>

            <div>
              <p className="text-small text-text-primary font-semibold">
                Share to
              </p>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {channels.map((channel) => (
                  <button
                    key={channel.label}
                    type="button"
                    onClick={() => openShareWindow(channel.href())}
                    className="border-border-light hover:border-border-hover hover:bg-bg-light focus-visible:ring-primary flex flex-col items-center gap-1.5 rounded-sm border px-2 py-3 transition-colors focus-visible:ring-2 focus-visible:outline-none"
                  >
                    <span
                      className={`flex size-8 items-center justify-center rounded-full ${channel.tone}`}
                    >
                      {channel.badge}
                    </span>
                    <span className="text-text-primary text-xs font-medium">
                      {channel.label}
                    </span>
                  </button>
                ))}
              </div>
              {canNativeShare && (
                <button
                  type="button"
                  onClick={handleNativeShare}
                  className="text-text-secondary hover:text-text-primary mt-3 inline-flex items-center gap-1.5 text-xs font-semibold"
                >
                  <Icon icon={Share2} size="sm" className="size-3.5" />
                  More options
                </button>
              )}
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
}
