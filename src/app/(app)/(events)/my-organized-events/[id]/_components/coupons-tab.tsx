"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Badge, Button, Icon, Input, Select } from "@/components/atoms";
import {
  Banner,
  FormField,
  Table,
  TableColumn,
  TableSkeleton,
} from "@/components/molecules";
import { Coupon } from "@/lib/event";
import { generateCouponCode } from "@/lib/coupon-code";
import { createCoupon, deactivateCoupon, listCoupons } from "@/lib/api/coupons";
import { adaptCoupon } from "@/lib/api/adapters";
import { ApiError } from "@/lib/api/client";

export interface CouponsTabProps {
  eventId: string;
}

const statusTone: Record<
  Coupon["computedStatus"],
  "success" | "warning" | "danger" | "neutral"
> = {
  ACTIVE: "success",
  SCHEDULED: "warning",
  EXHAUSTED: "warning",
  EXPIRED: "danger",
  INACTIVE: "neutral",
};

export function CouponsTab({ eventId }: CouponsTabProps) {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState<"PERCENT" | "FIXED">(
    "PERCENT",
  );
  const [discountValue, setDiscountValue] = useState("");
  const [maxRedemptions, setMaxRedemptions] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [validTo, setValidTo] = useState("");
  const [creating, setCreating] = useState(false);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function refresh() {
    try {
      const items = await listCoupons(eventId);
      setCoupons(items.map(adaptCoupon));
    } catch {
      // best-effort — list just won't show if this fails
    }
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const items = await listCoupons(eventId);
        if (!cancelled) setCoupons(items.map(adaptCoupon));
      } catch {
        // best-effort — list just won't show if this fails
      }
      if (!cancelled) setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  async function handleCreate() {
    const trimmedCode = code.trim();
    const value = Number(discountValue);
    if (!trimmedCode || !Number.isFinite(value) || value <= 0) {
      setError("Enter a code and a discount value greater than 0.");
      return;
    }
    setCreating(true);
    setError("");
    try {
      await createCoupon(eventId, {
        code: trimmedCode,
        discount_type: discountType,
        discount_value: value,
        max_redemptions: maxRedemptions.trim()
          ? Number(maxRedemptions)
          : undefined,
        valid_from: validFrom || undefined,
        valid_to: validTo || undefined,
      });
      setCode("");
      setDiscountValue("");
      setMaxRedemptions("");
      setValidFrom("");
      setValidTo("");
      await refresh();
    } catch (err) {
      setError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : "Couldn't create that coupon.",
      );
    } finally {
      setCreating(false);
    }
  }

  async function handleDeactivate(couponId: string) {
    setDeactivatingId(couponId);
    setError("");
    try {
      await deactivateCoupon(couponId);
      await refresh();
    } catch (err) {
      setError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : "Couldn't deactivate that coupon.",
      );
    } finally {
      setDeactivatingId(null);
    }
  }

  const columns: TableColumn<Coupon>[] = [
    {
      key: "code",
      header: "Code",
      render: (row) => (
        <span className="text-text-primary font-mono font-semibold">
          {row.code}
        </span>
      ),
    },
    {
      key: "discount",
      header: "Discount",
      render: (row) => (
        <span className="text-text-primary">
          {row.discountType === "PERCENT"
            ? `${row.discountValue}%`
            : `₹${row.discountValue}`}
        </span>
      ),
    },
    {
      key: "redemptions",
      header: "Redemptions",
      render: (row) => (
        <span className="text-text-secondary">
          {row.redemptionCount}
          {row.maxRedemptions !== undefined ? ` / ${row.maxRedemptions}` : ""}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <Badge variant="muted" tone={statusTone[row.computedStatus]} size="sm">
          {row.computedStatus}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (row) =>
        row.isActive && row.computedStatus !== "EXPIRED" ? (
          <Button
            variant="secondary"
            size="sm"
            disabled={deactivatingId === row.id}
            onClick={() => handleDeactivate(row.id)}
          >
            Deactivate
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-large text-text-primary font-semibold">Coupons</h2>
        <p className="text-body text-text-secondary">
          Create discount codes attendees can apply at checkout. A code that
          fully covers the price registers them for free without going through
          payment.
        </p>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <div className="lg:col-span-2">
          <FormField label="Code" htmlFor="coupon-code">
            <div className="flex gap-2">
              <Input
                id="coupon-code"
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                placeholder="SAVE20"
                disabled={creating}
              />
              <Button
                variant="secondary"
                onClick={() => setCode(generateCouponCode())}
                disabled={creating}
                aria-label="Generate a random code"
              >
                <Icon icon={RefreshCw} size="sm" />
              </Button>
            </div>
          </FormField>
        </div>
        <FormField label="Type" htmlFor="coupon-type">
          <Select
            id="coupon-type"
            value={discountType}
            onChange={(event) =>
              setDiscountType(event.target.value as "PERCENT" | "FIXED")
            }
            disabled={creating}
          >
            <option value="PERCENT">Percent off</option>
            <option value="FIXED">Fixed amount off</option>
          </Select>
        </FormField>
        <FormField label="Value" htmlFor="coupon-value">
          <Input
            id="coupon-value"
            type="number"
            min={0}
            value={discountValue}
            onChange={(event) => setDiscountValue(event.target.value)}
            placeholder={discountType === "PERCENT" ? "20" : "500"}
            disabled={creating}
          />
        </FormField>
        <FormField label="Max redemptions" htmlFor="coupon-max">
          <Input
            id="coupon-max"
            type="number"
            min={1}
            value={maxRedemptions}
            onChange={(event) => setMaxRedemptions(event.target.value)}
            placeholder="Unlimited"
            disabled={creating}
          />
        </FormField>
        <FormField label="Valid from" htmlFor="coupon-from">
          <Input
            id="coupon-from"
            type="date"
            value={validFrom}
            onChange={(event) => setValidFrom(event.target.value)}
            disabled={creating}
          />
        </FormField>
        <FormField label="Valid to" htmlFor="coupon-to">
          <Input
            id="coupon-to"
            type="date"
            value={validTo}
            onChange={(event) => setValidTo(event.target.value)}
            disabled={creating}
          />
        </FormField>
      </div>
      <Button variant="primary" disabled={creating} onClick={handleCreate}>
        {creating ? "Creating…" : "Create Coupon"}
      </Button>

      {!loaded ? (
        <TableSkeleton
          rows={3}
          cols={columns.length}
          label="Loading coupons…"
        />
      ) : (
        <Table
          columns={columns}
          rows={coupons}
          rowKey={(row) => row.id}
          emptyState={
            <p className="text-body text-text-secondary p-6 text-center">
              No coupons created yet.
            </p>
          }
        />
      )}
    </div>
  );
}
