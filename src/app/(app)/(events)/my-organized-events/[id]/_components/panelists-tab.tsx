"use client";

import { useEffect, useState } from "react";
import { Badge, Button, Input, RemoveIconButton } from "@/components/atoms";
import {
  Banner,
  FormField,
  Table,
  TableColumn,
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
import { panelistStatusLabel, panelistStatusTone } from "./status-maps";

export interface PanelistsTabProps {
  eventId: string;
}

export function PanelistsTab({ eventId }: PanelistsTabProps) {
  const [panelists, setPanelists] = useState<EventPanelist[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [email, setEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function refresh() {
    try {
      const items = await listEventPanelists(eventId);
      setPanelists(items.map(adaptEventPanelist));
    } catch {
      // best-effort — list just won't show if this fails
    }
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const items = await listEventPanelists(eventId);
        if (!cancelled) setPanelists(items.map(adaptEventPanelist));
      } catch {
        // best-effort — list just won't show if this fails
      }
      if (!cancelled) setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  async function handleInvite() {
    const trimmed = email.trim();
    if (!trimmed) return;
    setInviting(true);
    setError("");
    try {
      await invitePanelist(eventId, trimmed);
      setEmail("");
      await refresh();
    } catch (err) {
      setError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : "Couldn't send that invite.",
      );
    } finally {
      setInviting(false);
    }
  }

  async function handleRemove(panelistId: string) {
    setRemovingId(panelistId);
    setError("");
    try {
      await removePanelist(panelistId);
      await refresh();
    } catch (err) {
      setError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : "Couldn't remove that panelist.",
      );
    } finally {
      setRemovingId(null);
    }
  }

  const columns: TableColumn<EventPanelist>[] = [
    {
      key: "email",
      header: "Email",
      render: (row) => (
        <span className="text-text-primary">{row.invitedEmail}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <Badge variant="muted" tone={panelistStatusTone[row.status]} size="sm">
          {panelistStatusLabel[row.status]}
        </Badge>
      ),
    },
    {
      key: "invited",
      header: "Invited",
      render: (row) => (
        <span className="text-text-secondary">
          {new Date(row.invitedOn).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (row) => (
        <span
          className={
            removingId === row.id ? "pointer-events-none opacity-50" : ""
          }
        >
          <RemoveIconButton
            onClick={() => handleRemove(row.id)}
            ariaLabel={`Remove invite for ${row.invitedEmail}`}
          />
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-large text-text-primary font-semibold">
          Panelists
        </h2>
        <p className="text-body text-text-secondary">
          Invite anyone to judge this event as a panelist — they don&apos;t need
          any particular account type, just an email. Once accepted, they can
          score participants the same way you do in the Rounds tab.
        </p>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-64 flex-1">
          <FormField label="Invite by email" htmlFor="panelist-email">
            <Input
              id="panelist-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="panelist@example.com"
              disabled={inviting}
            />
          </FormField>
        </div>
        <Button
          variant="primary"
          disabled={!email.trim() || inviting}
          onClick={handleInvite}
        >
          {inviting ? "Sending…" : "Send Invite"}
        </Button>
      </div>

      {!loaded ? (
        <TableSkeleton
          rows={3}
          cols={columns.length}
          label="Loading panelists…"
        />
      ) : (
        <Table
          columns={columns}
          rows={panelists}
          rowKey={(row) => row.id}
          emptyState={
            <p className="text-body text-text-secondary p-6 text-center">
              No panelists invited yet.
            </p>
          }
        />
      )}
    </div>
  );
}
