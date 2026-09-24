"use client";

import { FormEvent, useState, useSyncExternalStore } from "react";
import { Check, Heart, Mail } from "lucide-react";
import { Button, Icon, Input } from "@/components/atoms";
import { FormField, Modal } from "@/components/molecules";
import { expressInterest } from "@/lib/api/interest";
import { ApiError } from "@/lib/api/client";
import { getSession } from "@/lib/auth/session";
import { VerifyEmailModal } from "../register/_components/verify-email-modal";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

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
  // Called after a successful submit so the page can re-fetch the count.
  onInterested?: () => void;
}

// Signed in -> one click. Guest -> email -> OTP (the same verify modal the
// register flow uses) -> submit.
export function InterestButton({ eventId, onInterested }: InterestButtonProps) {
  const interested = useInterested(eventId);
  const [submitting, setSubmitting] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(identity: { userId: string } | { email: string }) {
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
      setEmailOpen(true);
    }
  }

  function handleEmailSubmit(event: FormEvent) {
    event.preventDefault();
    if (!EMAIL_PATTERN.test(email.trim())) {
      setEmailError("Enter a valid email address");
      return;
    }
    setEmailError(null);
    setEmailOpen(false);
    setVerifyOpen(true);
  }

  async function handleVerified() {
    setVerifyOpen(false);
    await submit({ email: email.trim() });
  }

  if (interested) {
    return (
      <Button variant="secondary" className="w-full" disabled>
        <Icon icon={Check} size="sm" className="text-success" />
        Interested
      </Button>
    );
  }

  return (
    <>
      <Button
        variant="outline"
        className="w-full"
        loading={submitting}
        onClick={handleClick}
      >
        <Icon icon={Heart} size="sm" />
        I&apos;m Interested
      </Button>
      {error && (
        <p className="text-danger text-small text-center" role="alert">
          {error}
        </p>
      )}

      <Modal
        open={emailOpen}
        onClose={() => setEmailOpen(false)}
        title="Show your interest"
      >
        <form
          className="flex flex-col gap-4"
          noValidate
          onSubmit={handleEmailSubmit}
        >
          <p className="text-body text-text-secondary">
            Enter your email and we&apos;ll send a code to verify it. The
            organizer only sees how many people are interested.
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
    </>
  );
}
