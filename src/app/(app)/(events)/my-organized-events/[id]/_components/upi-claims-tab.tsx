"use client";

import { useMemo, useState } from "react";
import { Check, Copy, Receipt, X } from "lucide-react";
import { Avatar, Badge, BadgeTone, Button, Icon } from "@/components/atoms";
import {
  Banner,
  ConfirmDialog,
  EmptyState,
  FilterTiles,
  SectionHeader,
  TableSkeleton,
} from "@/components/molecules";
import { UpiClaim } from "@/lib/event";
import { confirmUpiClaim, rejectUpiClaim } from "@/lib/api/upi-claims";
import { ApiError } from "@/lib/api/client";
import { initials } from "@/lib/auth/format";
import { useOrganizedEvent } from "./event-context";

export interface UpiClaimsTabProps {
  eventId: string;
}

const statusTone: Record<UpiClaim["status"], BadgeTone> = {
  CONFIRMED: "success",
  PENDING: "warning",
  REJECTED: "danger",
};
const statusLabel: Record<UpiClaim["status"], string> = {
  CONFIRMED: "Confirmed",
  PENDING: "Needs review",
  REJECTED: "Rejected",
};

type Filter = "all" | UpiClaim["status"];

export function UpiClaimsTab({ eventId }: UpiClaimsTabProps) {
  void eventId;
  const { claims, claimsLoaded, refreshClaims, refreshAttendees, notify } =
    useOrganizedEvent();
  const [filter, setFilter] = useState<Filter | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toReject, setToReject] = useState<UpiClaim | null>(null);

  const counts = useMemo(
    () => ({
      all: claims.length,
      PENDING: claims.filter((c) => c.status === "PENDING").length,
      CONFIRMED: claims.filter((c) => c.status === "CONFIRMED").length,
      REJECTED: claims.filter((c) => c.status === "REJECTED").length,
    }),
    [claims],
  );

  // Default to the review queue when there is one, otherwise show everything.
  const activeFilter: Filter =
    filter ?? (counts.PENDING > 0 ? "PENDING" : "all");
  const visible = claims
    .filter((c) => activeFilter === "all" || c.status === activeFilter)
    .sort(
      (a, b) =>
        new Date(b.submittedOn).getTime() - new Date(a.submittedOn).getTime(),
    );
  const pendingAmount = claims
    .filter((c) => c.status === "PENDING")
    .reduce((s, c) => s + c.amountClaimed, 0);

  async function act(
    claim: UpiClaim,
    action: "confirm" | "reject",
  ): Promise<void> {
    setBusyId(claim.id);
    try {
      if (action === "confirm") await confirmUpiClaim(claim.id);
      else await rejectUpiClaim(claim.id);
      notify(
        action === "confirm"
          ? `Confirmed ${claim.fullName} — registered`
          : `Rejected claim from ${claim.fullName}`,
      );
      setToReject(null);
      // a confirmed claim is a new registration — the attendee list and its
      // count in the sidebar should show it straight away
      await Promise.all([refreshClaims(), refreshAttendees()]);
    } catch (err) {
      notify(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : `Couldn't ${action} that claim.`,
        "error",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function copyUtr(utr: string) {
    try {
      await navigator.clipboard.writeText(utr);
      notify("UTR copied");
    } catch {
      notify("Couldn't copy the UTR", "error");
    }
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="UPI claims"
        description="Attendees who paid the venue UPI QR report their UTR here. Confirm a claim to register them."
      />

      {counts.PENDING > 0 && (
        <Banner tone="warning">
          {`${counts.PENDING} claim${counts.PENDING === 1 ? "" : "s"} worth ₹${pendingAmount.toLocaleString("en-IN")} waiting. Match each UTR against your bank statement before confirming — this system can't verify it.`}
        </Banner>
      )}

      {claims.length > 0 && (
        <FilterTiles
          value={activeFilter}
          onChange={(v) => setFilter(v as Filter)}
          tiles={[
            {
              value: "PENDING",
              label: "Needs review",
              count: counts.PENDING,
              attention: true,
            },
            { value: "CONFIRMED", label: "Confirmed", count: counts.CONFIRMED },
            { value: "REJECTED", label: "Rejected", count: counts.REJECTED },
            { value: "all", label: "All claims", count: counts.all },
          ]}
        />
      )}

      {!claimsLoaded ? (
        <TableSkeleton rows={3} cols={3} label="Loading UPI claims…" />
      ) : claims.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No UPI claims yet"
          description="When someone pays via the offline UPI QR and submits their UTR, it shows up here for review."
        />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={Check}
          title="All caught up"
          description="Nothing in this view. Nice."
        />
      ) : (
        <ul className="space-y-3">
          {visible.map((claim) => {
            const busy = busyId === claim.id;
            return (
              <li
                key={claim.id}
                className="border-border-light bg-surface-light flex flex-wrap items-center gap-x-5 gap-y-3 rounded-md border p-4"
              >
                <Avatar
                  alt={claim.fullName}
                  initials={initials(claim.fullName)}
                  size="md"
                />
                <div className="min-w-0 flex-1 basis-48">
                  <p className="text-body text-text-primary truncate font-semibold">
                    {claim.fullName}
                  </p>
                  <p className="text-small text-text-secondary truncate">
                    {claim.email}
                  </p>
                </div>
                <div>
                  <p className="text-large text-text-primary font-extrabold tabular-nums">
                    ₹{claim.amountClaimed.toLocaleString()}
                  </p>
                  <button
                    type="button"
                    onClick={() => copyUtr(claim.utr)}
                    className="text-small text-text-secondary hover:text-text-primary focus-visible:ring-primary group inline-flex items-center gap-1 rounded-sm font-mono focus-visible:ring-2 focus-visible:outline-none"
                    aria-label={`Copy UTR ${claim.utr}`}
                  >
                    UTR {claim.utr}
                    <Icon
                      icon={Copy}
                      size="sm"
                      className="size-3 opacity-40 group-hover:opacity-100"
                    />
                  </button>
                </div>
                {claim.status === "PENDING" ? (
                  <div className="flex gap-2">
                    <Button
                      variant="success"
                      size="sm"
                      loading={busy}
                      onClick={() => act(claim, "confirm")}
                    >
                      <Icon icon={Check} size="sm" /> Confirm
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={busy}
                      onClick={() => setToReject(claim)}
                    >
                      <Icon icon={X} size="sm" /> Reject
                    </Button>
                  </div>
                ) : (
                  <Badge
                    variant="muted"
                    tone={statusTone[claim.status]}
                    size="sm"
                  >
                    {statusLabel[claim.status]}
                  </Badge>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={toReject !== null}
        title="Reject this claim?"
        confirmLabel="Reject claim"
        cancelLabel="Keep reviewing"
        busy={busyId !== null}
        onConfirm={() => toReject && act(toReject, "reject")}
        onClose={() => setToReject(null)}
      >
        <p>
          {toReject?.fullName} won&apos;t be registered. Only reject if the UTR
          doesn&apos;t appear in your bank statement.
        </p>
      </ConfirmDialog>
    </div>
  );
}
