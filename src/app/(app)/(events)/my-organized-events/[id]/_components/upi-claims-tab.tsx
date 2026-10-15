"use client";

import { useEffect, useState } from "react";
import { Badge, Button } from "@/components/atoms";
import { Banner, Table, TableColumn } from "@/components/molecules";
import { UpiClaim } from "@/lib/event";
import {
  confirmUpiClaim,
  listUpiClaims,
  rejectUpiClaim,
} from "@/lib/api/upi-claims";
import { adaptUpiClaim } from "@/lib/api/adapters";
import { ApiError } from "@/lib/api/client";

export interface UpiClaimsTabProps {
  eventId: string;
}

const statusTone: Record<UpiClaim["status"], "success" | "warning" | "danger"> = {
  CONFIRMED: "success",
  PENDING: "warning",
  REJECTED: "danger",
};

export function UpiClaimsTab({ eventId }: UpiClaimsTabProps) {
  const [claims, setClaims] = useState<UpiClaim[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function refresh() {
    try {
      const items = await listUpiClaims(eventId);
      setClaims(items.map(adaptUpiClaim));
    } catch {
      // best-effort — list just won't show if this fails
    }
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const items = await listUpiClaims(eventId);
        if (!cancelled) setClaims(items.map(adaptUpiClaim));
      } catch {
        // best-effort — list just won't show if this fails
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  async function handleConfirm(claimId: string) {
    setBusyId(claimId);
    setError("");
    try {
      await confirmUpiClaim(claimId);
      await refresh();
    } catch (err) {
      setError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : "Couldn't confirm that claim.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(claimId: string) {
    setBusyId(claimId);
    setError("");
    try {
      await rejectUpiClaim(claimId);
      await refresh();
    } catch (err) {
      setError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : "Couldn't reject that claim.",
      );
    } finally {
      setBusyId(null);
    }
  }

  const columns: TableColumn<UpiClaim>[] = [
    {
      key: "email",
      header: "Attendee",
      render: (row) => (
        <div>
          <div className="text-text-primary font-medium">{row.fullName}</div>
          <div className="text-text-secondary text-small">{row.email}</div>
        </div>
      ),
    },
    {
      key: "utr",
      header: "UTR",
      render: (row) => (
        <span className="text-text-primary font-mono">{row.utr}</span>
      ),
    },
    {
      key: "amount",
      header: "Amount claimed",
      render: (row) => (
        <span className="text-text-primary">₹{row.amountClaimed}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <Badge variant="muted" tone={statusTone[row.status]} size="sm">
          {row.status}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (row) =>
        row.status === "PENDING" ? (
          <div className="flex gap-2">
            <Button
              variant="primary"
              size="sm"
              disabled={busyId === row.id}
              onClick={() => handleConfirm(row.id)}
            >
              Confirm
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={busyId === row.id}
              onClick={() => handleReject(row.id)}
            >
              Reject
            </Button>
          </div>
        ) : null,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-large text-text-primary font-semibold">
          UPI Claims
        </h2>
        <p className="text-body text-text-secondary">
          Attendees who paid via the offline UPI QR at the venue self-report
          their transaction reference (UTR) here. Confirming a claim
          registers them for free — check the UTR against your own bank
          statement first, this system can&apos;t verify it for you.
        </p>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}

      <Table
        columns={columns}
        rows={claims}
        rowKey={(row) => row.id}
        emptyState={
          <p className="text-body text-text-secondary p-6 text-center">
            No UPI claims submitted yet.
          </p>
        }
      />
    </div>
  );
}
