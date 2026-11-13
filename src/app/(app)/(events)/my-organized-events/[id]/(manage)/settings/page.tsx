"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Banner,
  Modal,
  SectionHeader,
  SettingGroup,
  ValueLine,
} from "@/components/molecules";
import { Button, ButtonLink } from "@/components/atoms";
import { deleteEvent, updateEvent } from "@/lib/api/events";
import { getStatuses } from "@/lib/api/lookups";
import { useOrganizedEvent } from "../../_components/event-context";
import { CancelEventModal } from "../../_components/cancel-event-modal";

type Pending = "cancel" | "delete" | null;

// Reads ?action=cancel with useSearchParams, which needs a Suspense boundary.
export default function EventSettingsPage() {
  return (
    <Suspense fallback={null}>
      <EventSettings />
    </Suspense>
  );
}

function EventSettings() {
  const router = useRouter();
  const { event, attendees, refreshEvent, notify, isCancelled } =
    useOrganizedEvent();
  const searchParams = useSearchParams();
  // Jump to → "Cancel this event" lands here with ?action=cancel
  const [pending, setPending] = useState<Pending>(() =>
    searchParams.get("action") === "cancel" && event.status !== "CANCELLED"
      ? "cancel"
      : null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const isDraft = event.status === "DRAFT";
  const publicPath = `/events/${event.id}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}${publicPath}`,
      );
      notify("Public event link copied");
    } catch {
      notify("Couldn't copy — select the link and copy it manually", "error");
    }
  }

  function closeModal() {
    if (busy) return;
    setPending(null);
    setError("");
  }

  async function confirmCancel() {
    setBusy(true);
    setError("");
    try {
      const statuses = await getStatuses();
      const cancelled = statuses.find((s) => s.status_code === "CANCELLED");
      if (!cancelled) throw new Error("missing CANCELLED status");
      await updateEvent(event.id, { status_id: cancelled.id });
      await refreshEvent();
      setPending(null);
      notify("Event cancelled");
    } catch {
      setError("Couldn't cancel the event. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    setBusy(true);
    setError("");
    try {
      await deleteEvent(event.id);
      router.push("/my-organized-events");
    } catch {
      setError("Couldn't delete the draft. Please try again.");
      setBusy(false);
    }
  }

  return (
    <>
      <SectionHeader
        title="Settings"
        description="Public link, details and the point of no return."
      />
      <div className="bg-surface-light ring-primary/10 mt-6 rounded-lg p-5 shadow-sm ring-1 sm:p-8">
        <SettingGroup
          title="Public page"
          description="What attendees see and share."
        >
          <ValueLine
            text={publicPath}
            sub={
              isDraft
                ? "Drafts aren't visible to the public yet."
                : "Anyone with this link can view and register."
            }
            action={
              <>
                <Button variant="secondary" size="sm" onClick={copyLink}>
                  Copy link
                </Button>
                <ButtonLink href={publicPath} variant="secondary" size="sm">
                  View
                </ButtonLink>
              </>
            }
          />
        </SettingGroup>

        <SettingGroup
          title="Event details"
          description="Title, schedule, passes, rounds and terms."
        >
          <ValueLine
            text="Edit event"
            sub="Changes apply to the public page straight away."
            action={
              <ButtonLink
                href={`/my-organized-events/${event.id}/edit`}
                variant="secondary"
                size="sm"
                aria-disabled={isCancelled}
              >
                Edit details
              </ButtonLink>
            }
          />
        </SettingGroup>

        <SettingGroup
          title="Danger zone"
          description="These actions can't be undone."
        >
          {isCancelled ? (
            <p className="text-small text-text-secondary">
              This event is cancelled. There&apos;s nothing left to change.
            </p>
          ) : (
            <ValueLine
              text="Cancel this event"
              sub="Stops registrations and marks the public page as cancelled."
              action={
                <Button
                  variant="danger-ghost"
                  size="sm"
                  onClick={() => setPending("cancel")}
                >
                  Cancel event
                </Button>
              }
            />
          )}
          {isDraft && (
            <ValueLine
              text="Delete this draft"
              sub="Removes the draft permanently."
              action={
                <Button
                  variant="danger-ghost"
                  size="sm"
                  onClick={() => setPending("delete")}
                >
                  Delete draft
                </Button>
              }
            />
          )}
        </SettingGroup>
      </div>

      <CancelEventModal
        open={pending === "cancel"}
        onClose={closeModal}
        event={event}
        registrations={Math.max(attendees.length, event.registeredCount)}
        busy={busy}
        error={error}
        onConfirm={() => void confirmCancel()}
      />

      <Modal
        open={pending === "delete"}
        onClose={closeModal}
        title="Delete this draft?"
        footer={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={closeModal}
              disabled={busy}
            >
              Keep draft
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={busy}
              onClick={confirmDelete}
            >
              Delete draft
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p>
            This permanently removes the draft and anything you&apos;ve entered.
          </p>
          {error && <Banner tone="danger">{error}</Banner>}
        </div>
      </Modal>
    </>
  );
}
