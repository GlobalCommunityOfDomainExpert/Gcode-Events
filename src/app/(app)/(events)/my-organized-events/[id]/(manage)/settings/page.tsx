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
import { isAdmin } from "@/lib/auth/session";
import { deleteRule } from "@/lib/event-delete";
import { useSession } from "@/hooks/use-session";
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
  const session = useSession();
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
  const registrations = Math.max(attendees.length, event.registeredCount);
  const rule = deleteRule({
    status: event.status ?? "",
    registrations,
    isAdmin: isAdmin(session),
  });

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
      if (!rule.allowed) throw new Error("not allowed");
      await deleteEvent(event.id);
      router.push("/my-organized-events");
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : "Couldn't delete the event. Please try again.",
      );
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
          {rule.allowed ? (
            <ValueLine
              text={rule.draft ? "Delete this draft" : "Delete this event"}
              sub={
                rule.draft
                  ? "Removes the draft permanently."
                  : `Removes the event${registrations ? ` and its ${registrations} registration${registrations > 1 ? "s" : ""}` : ""} permanently. Admin only.`
              }
              action={
                <Button
                  variant="danger-ghost"
                  size="sm"
                  onClick={() => setPending("delete")}
                >
                  {rule.draft ? "Delete draft" : "Delete event"}
                </Button>
              }
            />
          ) : null}
        </SettingGroup>
      </div>

      <CancelEventModal
        open={pending === "cancel"}
        onClose={closeModal}
        event={event}
        registrations={registrations}
        busy={busy}
        error={error}
        onConfirm={() => void confirmCancel()}
      />

      <Modal
        open={pending === "delete"}
        onClose={closeModal}
        title={
          rule.allowed && !rule.draft
            ? "Delete this event?"
            : "Delete this draft?"
        }
        footer={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={closeModal}
              disabled={busy}
            >
              {rule.allowed && !rule.draft ? "Keep event" : "Keep draft"}
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={busy}
              onClick={confirmDelete}
            >
              {rule.allowed && !rule.draft ? "Delete event" : "Delete draft"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p>
            {rule.allowed && !rule.draft
              ? `This permanently removes "${event.title}"${registrations ? ` and its ${registrations} registration${registrations > 1 ? "s" : ""}` : ""}. This can't be undone.`
              : "This permanently removes the draft and anything you've entered."}
          </p>
          {rule.allowed && rule.override && (
            <Banner tone="danger">
              Admin override: this event has more than 2 registrations, and they
              are deleted with it.
            </Banner>
          )}
          {rule.allowed && rule.override && (
            <Banner tone="danger">
              Admin override: this event has more than 2 registrations, and they
              are deleted with it.
            </Banner>
          )}
          {error && <Banner tone="danger">{error}</Banner>}
        </div>
      </Modal>
    </>
  );
}
