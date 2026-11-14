"use client";

import Link from "next/link";
import { useState } from "react";
import { CalendarClock, TriangleAlert, Users } from "lucide-react";
import { Banner, FormField, Modal } from "@/components/molecules";
import { Button, Icon, Input } from "@/components/atoms";
import type { Event } from "@/lib/event";

// Cancelling is the one action you can't take back — so the modal shows what
// it affects, offers rescheduling instead, and asks you to type CANCEL before
// the button wakes up. It only marks the event cancelled: nobody is emailed
// and nothing is refunded automatically, and the copy says nothing else.
export function CancelEventModal({
  open,
  onClose,
  event,
  registrations,
  busy,
  error,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  event: Event;
  registrations: number;
  busy: boolean;
  error: string;
  onConfirm: () => void;
}) {
  const [typed, setTyped] = useState("");
  const ready = typed.trim().toUpperCase() === "CANCEL";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Cancel this event?"
      size="lg"
      footer={
        <>
          <Button
            variant="secondary"
            size="sm"
            onClick={onClose}
            disabled={busy}
          >
            Keep event
          </Button>
          <Button
            variant="danger"
            size="sm"
            loading={busy}
            disabled={!ready}
            onClick={onConfirm}
          >
            Cancel event
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <Impact
            icon={Users}
            value={registrations.toLocaleString("en-IN")}
            label="registrations on this event"
          />
          <Impact
            icon={TriangleAlert}
            value="Public"
            label="page marked cancelled"
          />
        </div>

        <div className="border-border-light bg-bg-subtle flex items-start gap-3 rounded-md border p-4">
          <Icon
            icon={CalendarClock}
            size="sm"
            className="text-primary mt-0.5 size-5 shrink-0"
          />
          <div className="text-small">
            <p className="text-text-primary font-semibold">
              Moving the date instead?
            </p>
            <p className="text-text-secondary">
              Changing the date keeps every registration.
            </p>
            <Link
              href={`/my-organized-events/${event.id}/edit`}
              className="text-primary mt-1 inline-block font-semibold hover:underline"
            >
              Change the date →
            </Link>
          </div>
        </div>

        <p className="text-small text-text-secondary">
          Cancelling stops new registrations and marks the public page as
          cancelled. Attendees are not contacted automatically — reach out to
          them yourself.
        </p>

        <FormField label='Type "CANCEL" to confirm' htmlFor="cancel-confirm">
          <Input
            id="cancel-confirm"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="CANCEL"
            autoComplete="off"
            disabled={busy}
          />
        </FormField>

        {error && <Banner tone="danger">{error}</Banner>}
      </div>
    </Modal>
  );
}

function Impact({
  icon,
  value,
  label,
}: {
  icon: typeof Users;
  value: string;
  label: string;
}) {
  return (
    <div className="bg-danger-light rounded-md p-3">
      <p className="text-danger flex items-center gap-1.5 text-xs font-semibold">
        <Icon icon={icon} size="sm" className="size-3.5" /> {label}
      </p>
      <p className="text-text-primary mt-1 text-xl font-extrabold">{value}</p>
    </div>
  );
}
