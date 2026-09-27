"use client";

import { ReactNode, useState } from "react";
import { Mail, MessageCircle, Share2 } from "lucide-react";
import { Button, Card, Icon, SectionLabel } from "@/components/atoms";
import { Modal } from "@/components/molecules";

interface ShareEventCardProps {
  url: string;
  title: string;
  // Rendered next to the Share button — the event page passes the
  // "I'm Interested" heart icon button here so the two sit side by side.
  interestButton?: ReactNode;
}

export function ShareEventCard({
  url,
  title,
  interestButton,
}: ShareEventCardProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const canNativeShare =
    typeof navigator !== "undefined" && "share" in navigator;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable — no-op
    }
  }

  async function handleNativeShare() {
    try {
      await navigator.share({ title, url });
    } catch {
      // user cancelled or unsupported — no-op
    }
  }

  function openShareWindow(shareUrl: string) {
    window.open(shareUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <>
      <Card className="space-y-3">
        <SectionLabel>Share Event</SectionLabel>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
            <Icon icon={Share2} size="sm" />
            Share
          </Button>
          {interestButton}
        </div>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Share Event">
        <div className="space-y-4">
          <div className="border-border-light bg-bg-light flex items-center gap-2 rounded-sm border px-3 py-2">
            <span className="text-small text-text-secondary flex-1 truncate">
              {url}
            </span>
            <Button variant="secondary" size="xs" onClick={handleCopy}>
              {copied ? "Copied!" : "Copy"}
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                openShareWindow(
                  `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(url)}`,
                )
              }
            >
              <Icon icon={Mail} size="sm" />
              Email
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                openShareWindow(
                  `https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}`,
                )
              }
            >
              <Icon icon={MessageCircle} size="sm" />
              WhatsApp
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                openShareWindow(
                  `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
                )
              }
            >
              Facebook
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                openShareWindow(
                  `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
                )
              }
            >
              LinkedIn
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                openShareWindow(
                  `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`,
                )
              }
            >
              Twitter / X
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                openShareWindow(
                  `https://www.reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`,
                )
              }
            >
              Reddit
            </Button>
            {canNativeShare && (
              <Button variant="secondary" size="sm" onClick={handleNativeShare}>
                <Icon icon={Share2} size="sm" />
                More
              </Button>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}
