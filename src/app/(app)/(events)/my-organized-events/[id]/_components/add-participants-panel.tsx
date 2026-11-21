"use client";

import { useState } from "react";
import { Button, Input } from "@/components/atoms";
import { Banner, FormField } from "@/components/molecules";
import { Event } from "@/lib/event";
import { registerForEvent } from "@/lib/api/participants";
import { decideRoundStatus } from "@/lib/api/rounds";
import { ApiError } from "@/lib/api/client";

export interface AddParticipantsPanelProps {
  event: Event;
  // Rounds before the one currently selected — each gets a backfilled
  // SHORTLISTED decision so the new participant's history looks like they
  // organically passed through, same as anyone who actually competed.
  priorRounds: { id: string }[];
  // Refetches attendees (parent page) and round decisions (RoundsTab) so the
  // new participant shows up immediately without a full reload.
  onAdded: () => void;
}

// Lets an organizer plug someone who found this event through another
// platform directly into whichever round they're currently viewing, without
// that person going through public registration or earlier rounds at all.
// Not lock-gated (see isActiveRoundLocked in rounds-tab.tsx) — an organizer
// can stage a wildcard entrant into a future round before the cohort
// actually reaches it.
export function AddParticipantsPanel({
  event,
  priorRounds,
  onAdded,
}: AddParticipantsPanelProps) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function handleAdd() {
    const trimmedName = fullName.trim();
    const trimmedEmail = email.trim();
    if (!trimmedName || !trimmedEmail) return;
    setSubmitting(true);
    setError("");
    setNotice("");
    try {
      const { participantId } = await registerForEvent(event.id, {
        email: trimmedEmail,
        fullName: trimmedName,
        phone: phone.trim() || undefined,
        quantity: 1,
        category: "PARTICIPANT",
        // Wildcard entrants bypass the registration window and the
        // OTP-verification requirement on purpose — that's the whole point
        // of this form existing. Capacity is still enforced server-side
        // regardless.
        skipWindowCheck: true,
        skipEmailVerification: true,
      });

      // Backfilled, not a real judge decision — notify=false so they don't
      // get a shortlist-congratulations email for rounds they never
      // actually competed in.
      await Promise.all(
        priorRounds.map((round) =>
          decideRoundStatus(participantId, round.id, "SHORTLISTED", false),
        ),
      );

      setFullName("");
      setEmail("");
      setPhone("");
      setNotice(`Added ${trimmedName}.`);
      onAdded();
    } catch (err) {
      setError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : "Couldn't add this participant.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-body text-text-primary font-semibold">
          Add a wildcard participant
        </p>
        <p className="text-small text-text-secondary">
          For someone who found this event through another platform — skips
          public registration and drops them straight into this round.
          {priorRounds.length > 0 &&
            " They'll be marked as having passed every round before this one, without triggering the usual shortlist emails for rounds they didn't actually compete in."}
        </p>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}
      {notice && <Banner tone="success">{notice}</Banner>}

      <div className="grid gap-4 sm:grid-cols-3">
        <FormField label="Full name" htmlFor="wildcard-full-name">
          <Input
            id="wildcard-full-name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Jane Doe"
            disabled={submitting}
          />
        </FormField>
        <FormField label="Email" htmlFor="wildcard-email">
          <Input
            id="wildcard-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jane@example.com"
            disabled={submitting}
          />
        </FormField>
        <FormField label="Phone (optional)" htmlFor="wildcard-phone">
          <Input
            id="wildcard-phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder=""
            disabled={submitting}
          />
        </FormField>
      </div>

      <Button
        variant="primary"
        disabled={!fullName.trim() || !email.trim() || submitting}
        onClick={handleAdd}
      >
        {submitting ? "Adding…" : "Add Participant"}
      </Button>
    </div>
  );
}
