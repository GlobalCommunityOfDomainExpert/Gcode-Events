"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/atoms";
import { Banner } from "@/components/molecules";
import { listEventRounds, replaceEventRounds } from "@/lib/api/rounds";
import { toRoundsDraft, toRoundsPayload } from "@/lib/api/adapters";
import { ApiError } from "@/lib/api/client";
import { EventDetailData, initialEventData } from "@/lib/zod/event";
import { RoundsEditor, roundProblems } from "./rounds-editor";

type Rounds = EventDetailData["rounds"];

// Round setup lives on the dashboard, next to running them — the public
// editor only covers what the event page shows. Saves straight to
// /events/:id/rounds (full replace, order = sort_order).
export function RoundsConfig({
  eventId,
  hasProgress,
  onSaved,
  onCancel,
}: {
  eventId: string;
  /** Someone's already registered to compete — warn before removing rounds. */
  hasProgress: boolean;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const [initial, setInitial] = useState<Rounds | null>(null);
  const [rounds, setRounds] = useState<Rounds>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listEventRounds(eventId).then((rows) => {
      if (cancelled) return;
      const draft = toRoundsDraft(rows);
      setInitial(draft);
      setRounds(draft);
    });
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  if (!initial) {
    return <p className="text-small text-text-secondary">Loading rounds…</p>;
  }

  const dirty = JSON.stringify(rounds) !== JSON.stringify(initial);
  const removed = initial.filter(
    (r) => r.id != null && !rounds.some((x) => x.id === r.id),
  ).length;
  const blocking = rounds.filter((r) => roundProblems(r).length > 0).length;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await replaceEventRounds(
        eventId,
        toRoundsPayload({ ...initialEventData, rounds }),
      );
      onSaved();
    } catch (e) {
      setError(
        e instanceof ApiError || e instanceof Error
          ? e.message
          : "Couldn't save rounds. Try again.",
      );
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <RoundsEditor rounds={rounds} onChange={setRounds} />

      {hasProgress && removed > 0 && (
        <Banner tone="warning">
          You&apos;re removing {removed} round{removed > 1 ? "s" : ""} that may
          already have shortlists or scores. Those results go with them.
        </Banner>
      )}
      {error && (
        <p className="text-small text-danger" role="alert">
          {error}
        </p>
      )}

      {/* sticky so Save is reachable while editing a long round */}
      <div className="border-border-light bg-surface-light/95 sticky bottom-0 z-10 flex flex-wrap items-center justify-end gap-3 rounded-lg border px-4 py-3 shadow-sm backdrop-blur">
        <p className="text-small text-text-secondary mr-auto">
          {blocking > 0
            ? `Fix ${blocking} round${blocking > 1 ? "s" : ""} marked ⚠ to save.`
            : dirty
              ? "Unsaved changes"
              : "No changes"}
        </p>
        {onCancel && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={saving}
          >
            Cancel
          </Button>
        )}
        <Button
          variant="primary"
          size="sm"
          onClick={() => void save()}
          disabled={!dirty || blocking > 0}
          loading={saving}
        >
          Save rounds
        </Button>
      </div>
    </div>
  );
}
