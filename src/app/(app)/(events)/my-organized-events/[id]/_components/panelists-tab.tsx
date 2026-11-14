"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { UserCheck } from "lucide-react";
import { Avatar, Badge, Button } from "@/components/atoms";
import {
  Banner,
  ConfirmDialog,
  EmptyState,
  FilterTiles,
  SectionHeader,
  TableSkeleton,
} from "@/components/molecules";
import { EventPanelist } from "@/lib/event";
import {
  invitePanelist,
  listEventPanelists,
  removePanelist,
} from "@/lib/api/panelists";
import { adaptEventPanelist } from "@/lib/api/adapters";
import { ApiError } from "@/lib/api/client";
import { useOrganizedEvent } from "./event-context";
import { InvitePanelistsModal } from "./invite-panelists-modal";
import { eventTools } from "@/lib/organizer";
import { panelistStatusLabel, panelistStatusTone } from "./status-maps";

export interface PanelistsTabProps {
  eventId: string;
}

type Filter = "all" | EventPanelist["status"];

export function PanelistsTab({ eventId }: PanelistsTabProps) {
  const { event, notify } = useOrganizedEvent();
  const [panelists, setPanelists] = useState<EventPanelist[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const searchParams = useSearchParams();
  const [inviteOpen, setInviteOpen] = useState(
    () => searchParams.get("invite") === "1",
  );
  const [toRemove, setToRemove] = useState<EventPanelist | null>(null);
  const [removing, setRemoving] = useState(false);

  async function refresh() {
    try {
      const items = await listEventPanelists(eventId);
      setPanelists(items.map(adaptEventPanelist));
    } catch {
      notify("Couldn't load panelists", "error");
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const items = await listEventPanelists(eventId);
        if (!cancelled) setPanelists(items.map(adaptEventPanelist));
      } catch {
        // empty state explains next steps
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  const counts = useMemo(
    () => ({
      all: panelists.length,
      ACCEPTED: panelists.filter((p) => p.status === "ACCEPTED").length,
      INVITED: panelists.filter((p) => p.status === "INVITED").length,
      DECLINED: panelists.filter((p) => p.status === "DECLINED").length,
    }),
    [panelists],
  );
  const visible = panelists.filter(
    (p) => filter === "all" || p.status === filter,
  );

  const noun = eventTools(event).judging ? "judges" : "panelists";

  function openInvite() {
    setInviteOpen(true);
  }

  async function confirmRemove() {
    if (!toRemove) return;
    setRemoving(true);
    try {
      await removePanelist(toRemove.id);
      notify(`Removed ${toRemove.invitedEmail}`);
      setToRemove(null);
      await refresh();
    } catch (err) {
      notify(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : "Couldn't remove that panelist.",
        "error",
      );
    } finally {
      setRemoving(false);
    }
  }

  const needsJudges =
    loaded &&
    event.rounds.length > 0 &&
    counts.ACCEPTED === 0 &&
    event.participantRegistration.enabled;

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Panelists"
        description="Invite judges by email — no account type needed. Once they accept, they can score participants in Rounds."
        actions={
          <Button variant="primary" onClick={openInvite}>
            + Invite {noun}
          </Button>
        }
      />

      {needsJudges && (
        <Banner tone="warning">
          This event has judging rounds but no accepted panelists yet — invite
          at least one judge before scoring starts.
        </Banner>
      )}

      {panelists.length > 0 && (
        <FilterTiles
          value={filter}
          onChange={(v) => setFilter(v as Filter)}
          tiles={[
            { value: "all", label: "All", count: counts.all },
            { value: "ACCEPTED", label: "Accepted", count: counts.ACCEPTED },
            {
              value: "INVITED",
              label: "Awaiting reply",
              count: counts.INVITED,
              attention: true,
            },
            { value: "DECLINED", label: "Declined", count: counts.DECLINED },
          ]}
        />
      )}

      {!loaded ? (
        <TableSkeleton rows={3} cols={3} label="Loading panelists…" />
      ) : panelists.length === 0 ? (
        <EmptyState
          icon={UserCheck}
          title="No panelists yet"
          description="Invite the people who will judge or review submissions. They get an email with a link to accept."
          action={
            <Button variant="primary" onClick={openInvite}>
              + Invite {noun}
            </Button>
          }
        />
      ) : visible.length === 0 ? (
        <p className="text-body text-text-secondary border-border-light bg-surface-light rounded-md border p-8 text-center">
          No panelists in this view.
        </p>
      ) : (
        <ul className="border-border-light bg-surface-light divide-border-light divide-y rounded-md border">
          {visible.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
            >
              <Avatar
                alt={p.invitedEmail}
                initials={p.invitedEmail.slice(0, 2).toUpperCase()}
                size="md"
              />
              <div className="min-w-0 flex-1">
                <p className="text-body text-text-primary truncate font-medium">
                  {p.invitedEmail}
                </p>
                <p className="text-small text-text-secondary">
                  Invited {new Date(p.invitedOn).toLocaleDateString("en-IN")}
                  {p.respondedOn &&
                    ` · replied ${new Date(p.respondedOn).toLocaleDateString("en-IN")}`}
                </p>
              </div>
              <Badge
                variant="muted"
                tone={panelistStatusTone[p.status]}
                size="sm"
              >
                {panelistStatusLabel[p.status]}
              </Badge>
              <Button
                variant="danger-ghost"
                size="sm"
                onClick={() => setToRemove(p)}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}

      <InvitePanelistsModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        noun={noun}
        existing={panelists.map((p) => p.invitedEmail.toLowerCase())}
        onInvite={async (address) => {
          await invitePanelist(eventId, address);
          notify(`Invite sent to ${address}`);
          await refresh();
        }}
      />

      <ConfirmDialog
        open={toRemove !== null}
        title="Remove this panelist?"
        confirmLabel="Remove"
        busy={removing}
        onConfirm={confirmRemove}
        onClose={() => setToRemove(null)}
      >
        <p>
          {toRemove?.invitedEmail} will lose access to score this event. Scores
          they already submitted are kept.
        </p>
      </ConfirmDialog>
    </div>
  );
}
