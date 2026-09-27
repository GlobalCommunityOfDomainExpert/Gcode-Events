"use client";

import { FormEvent, useState, useSyncExternalStore } from "react";
import { Heart, Mail, Phone } from "lucide-react";
import { Button, Icon, Input } from "@/components/atoms";
import { FormField, Modal } from "@/components/molecules";
import { expressInterest } from "@/lib/api/interest";
import { ApiError } from "@/lib/api/client";
import { getSession } from "@/lib/auth/session";
import { VerifyEmailModal } from "../register/_components/verify-email-modal";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// Loose on purpose — an optional leading "+" then 7-15 digits. Format only,
// never OTP/SMS-verified (unlike email), so this just catches typos.
const PHONE_PATTERN = /^\+?[0-9]{7,15}$/;

// Strips spaces/dashes/parens so "+91 98765 43210" validates and is sent
// the same way as "+919876543210" — the server does the same normalization.
function normalizePhone(phone: string): string {
  return phone.replace(/[^0-9+]/g, "");
}

// UX-only memory of "this browser already showed interest" so the button
// stays ticked across reloads. The server is the source of truth and is
// idempotent per (event, email), so a missing/blocked localStorage just
// means the button looks fresh again — never a double count.
//
// Kept in a small external store (not component state) because the event
// page renders the booking card twice — mobile and desktop placements, one
// hidden by CSS — and both copies must show the same tick.
const CHANGE_EVENT = "gcode-interest-change";
const interestedThisSession = new Set<string>();

function storageKey(eventId: string) {
  return `gcode-interest-${eventId}`;
}

function readInterested(eventId: string): boolean {
  if (interestedThisSession.has(eventId)) return true;
  try {
    return localStorage.getItem(storageKey(eventId)) === "1";
  } catch {
    return false;
  }
}

function rememberInterested(eventId: string) {
  // In-memory copy covers blocked storage — the button still flips for
  // this page view.
  interestedThisSession.add(eventId);
  try {
    localStorage.setItem(storageKey(eventId), "1");
  } catch {
    // Storage blocked — handled by the in-memory set above.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribeInterested(onChange: () => void) {
  // "storage" also keeps other open tabs of the same event in sync.
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function useInterested(eventId: string) {
  return useSyncExternalStore(
    subscribeInterested,
    () => readInterested(eventId),
    () => false,
  );
}

export interface InterestButtonProps {
  eventId: string;
  interestedCount?: number;
  // Called after a successful submit so the page can re-fetch the count.
  onInterested?: () => void;
}

// Icon-only heart button, meant to sit next to the Share button. Signed in
// -> one click, no popup. Guest -> a popup asks for email + phone, then the
// same OTP modal the register flow uses verifies the email (the phone is
// format-checked only, never OTP-verified).
export function InterestButton({
  eventId,
  interestedCount = 0,
  onInterested,
}: InterestButtonProps) {
  const interested = useInterested(eventId);
  const [submitting, setSubmitting] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(
    identity: { userId: string } | { email: string; phone: string },
  ) {
    setSubmitting(true);
    setError(null);
    try {
      await expressInterest(eventId, identity);
      rememberInterested(eventId);
      onInterested?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  function handleClick() {
    setError(null);
    const session = getSession();
    if (session) {
      void submit({ userId: session.userId });
    } else {
      setDetailsOpen(true);
    }
  }

  function handleDetailsSubmit(event: FormEvent) {
    event.preventDefault();
    const normalizedPhone = normalizePhone(phone);
    const validEmail = EMAIL_PATTERN.test(email.trim());
    const validPhone = PHONE_PATTERN.test(normalizedPhone);
    setEmailError(validEmail ? null : "Enter a valid email address");
    setPhoneError(validPhone ? null : "Enter a valid phone number");
    if (!validEmail || !validPhone) return;
    setDetailsOpen(false);
    setVerifyOpen(true);
  }

  async function handleVerified() {
    setVerifyOpen(false);
    await submit({ email: email.trim(), phone: normalizePhone(phone) });
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant={interested ? "secondary" : "outline"}
        size="xs"
        className="aspect-square !px-0"
        loading={submitting}
        disabled={interested}
        onClick={handleClick}
        aria-label={interested ? "You're interested" : "I'm Interested"}
        title={interested ? "You're interested" : "I'm Interested"}
      >
        <Icon
          icon={Heart}
          size="sm"
          className={interested ? "fill-danger text-danger" : ""}
        />
      </Button>
      {interestedCount > 0 && (
        <span className="text-small text-text-secondary">
          {interestedCount}
        </span>
      )}
      {error && (
        <p className="text-danger text-small" role="alert">
          {error}
        </p>
      )}

      <Modal
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        title="Show your interest"
      >
        <form
          className="flex flex-col gap-4"
          noValidate
          onSubmit={handleDetailsSubmit}
        >
          <p className="text-body text-text-secondary">
            Enter your email and phone number. We&apos;ll send a code to verify
            your email. The organizer only sees how many people are interested.
          </p>
          <FormField
            label="Email"
            htmlFor="interest-email"
            error={emailError ?? undefined}
          >
            <Input
              id="interest-email"
              type="email"
              autoComplete="email"
              icon={Mail}
              placeholder="you@example.com"
              value={email}
              error={!!emailError}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
            />
          </FormField>
          <FormField
            label="Phone Number"
            htmlFor="interest-phone"
            error={phoneError ?? undefined}
          >
            <Input
              id="interest-phone"
              type="tel"
              autoComplete="tel"
              icon={Phone}
              placeholder="+91 98765 43210"
              value={phone}
              error={!!phoneError}
              onChange={(e) => setPhone(e.target.value)}
            />
          </FormField>
          <Button type="submit" variant="primary" className="w-full">
            Send Code
          </Button>
        </form>
      </Modal>

      <VerifyEmailModal
        open={verifyOpen}
        email={email.trim()}
        onClose={() => setVerifyOpen(false)}
        onVerified={handleVerified}
      />
    </div>
  );
}
