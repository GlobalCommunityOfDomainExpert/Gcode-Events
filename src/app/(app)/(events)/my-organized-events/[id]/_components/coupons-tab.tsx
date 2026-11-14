"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Copy, RefreshCw, Tag } from "lucide-react";
import {
  Badge,
  BadgeTone,
  Button,
  Icon,
  Input,
  Progress,
  Select,
} from "@/components/atoms";
import {
  ConfirmDialog,
  EmptyState,
  FilterTiles,
  FormField,
  Modal,
  SectionHeader,
  TableSkeleton,
} from "@/components/molecules";
import { Coupon } from "@/lib/event";
import { generateCouponCode } from "@/lib/coupon-code";
import { createCoupon, deactivateCoupon, listCoupons } from "@/lib/api/coupons";
import { adaptCoupon } from "@/lib/api/adapters";
import { ApiError } from "@/lib/api/client";
import { useOrganizedEvent } from "./event-context";

export interface CouponsTabProps {
  eventId: string;
}

const statusTone: Record<Coupon["computedStatus"], BadgeTone> = {
  ACTIVE: "success",
  SCHEDULED: "warning",
  EXHAUSTED: "warning",
  EXPIRED: "danger",
  INACTIVE: "neutral",
};

const statusLabel: Record<Coupon["computedStatus"], string> = {
  ACTIVE: "Active",
  SCHEDULED: "Scheduled",
  EXHAUSTED: "Used up",
  EXPIRED: "Expired",
  INACTIVE: "Inactive",
};

type Filter = "all" | "live" | "ended";

function formatDate(iso?: string) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function discountLabel(c: Pick<Coupon, "discountType" | "discountValue">) {
  return c.discountType === "PERCENT"
    ? `${c.discountValue}% off`
    : `₹${c.discountValue} off`;
}

const emptyForm = {
  code: "",
  type: "PERCENT" as "PERCENT" | "FIXED",
  value: "",
  max: "",
  from: "",
  to: "",
};

export function CouponsTab({ eventId }: CouponsTabProps) {
  const { notify } = useOrganizedEvent();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const searchParams = useSearchParams();
  // Jump to → "Create a coupon" lands here with ?new=1
  const [creating, setCreating] = useState(
    () => searchParams.get("new") === "1",
  );
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [toDeactivate, setToDeactivate] = useState<Coupon | null>(null);
  const [deactivating, setDeactivating] = useState(false);

  async function refresh() {
    try {
      const items = await listCoupons(eventId);
      setCoupons(items.map(adaptCoupon));
    } catch {
      notify("Couldn't load coupons", "error");
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const items = await listCoupons(eventId);
        if (!cancelled) setCoupons(items.map(adaptCoupon));
      } catch {
        // list stays empty; the empty state explains next steps
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  const live = (c: Coupon) =>
    c.computedStatus === "ACTIVE" || c.computedStatus === "SCHEDULED";
  const counts = useMemo(
    () => ({
      all: coupons.length,
      live: coupons.filter(live).length,
      ended: coupons.filter((c) => !live(c)).length,
    }),
    [coupons],
  );
  const visible = coupons.filter((c) =>
    filter === "all" ? true : filter === "live" ? live(c) : !live(c),
  );

  function openCreate() {
    setForm({ ...emptyForm, code: generateCouponCode() });
    setFormError("");
    setCreating(true);
  }

  async function handleCreate() {
    const code = form.code.trim();
    const value = Number(form.value);
    if (!code) return setFormError("Enter a code.");
    if (!Number.isFinite(value) || value <= 0)
      return setFormError("Discount must be greater than 0.");
    if (form.type === "PERCENT" && value > 100)
      return setFormError("A percentage can't exceed 100.");
    setSaving(true);
    setFormError("");
    try {
      await createCoupon(eventId, {
        code,
        discount_type: form.type,
        discount_value: value,
        max_redemptions: form.max.trim() ? Number(form.max) : undefined,
        valid_from: form.from || undefined,
        valid_to: form.to || undefined,
      });
      setCreating(false);
      notify(`Coupon ${code} created`);
      await refresh();
    } catch (err) {
      setFormError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : "Couldn't create that coupon.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function confirmDeactivate() {
    if (!toDeactivate) return;
    setDeactivating(true);
    try {
      await deactivateCoupon(toDeactivate.id);
      notify(`Coupon ${toDeactivate.code} deactivated`);
      setToDeactivate(null);
      await refresh();
    } catch (err) {
      notify(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : "Couldn't deactivate that coupon.",
        "error",
      );
    } finally {
      setDeactivating(false);
    }
  }

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      notify(`Copied ${code}`);
    } catch {
      notify("Couldn't copy the code", "error");
    }
  }

  const setField = (key: keyof typeof emptyForm, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const previewValue = Number(form.value);
  const preview =
    form.value && previewValue > 0
      ? discountLabel({ discountType: form.type, discountValue: previewValue })
      : "—";

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Coupons"
        description="Discount codes for checkout. A code that covers the full price registers the attendee for free."
        actions={
          <Button variant="primary" onClick={openCreate}>
            + New coupon
          </Button>
        }
      />

      {coupons.length > 0 && (
        <FilterTiles
          value={filter}
          onChange={(v) => setFilter(v as Filter)}
          tiles={[
            { value: "all", label: "All coupons", count: counts.all },
            { value: "live", label: "Live", count: counts.live },
            { value: "ended", label: "Ended", count: counts.ended },
          ]}
        />
      )}

      {!loaded ? (
        <TableSkeleton rows={3} cols={3} label="Loading coupons…" />
      ) : coupons.length === 0 ? (
        <EmptyState
          icon={Tag}
          title="No coupons yet"
          description="Create a code for early birds, partners or a campaign — you'll see redemptions here."
          action={
            <Button variant="primary" onClick={openCreate}>
              + New coupon
            </Button>
          }
        />
      ) : visible.length === 0 ? (
        <p className="text-body text-text-secondary border-border-light bg-surface-light rounded-md border p-8 text-center">
          No coupons in this view.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((coupon) => {
            const used = coupon.redemptionCount;
            const max = coupon.maxRedemptions;
            const pct = max ? Math.min(100, Math.round((used / max) * 100)) : 0;
            const from = formatDate(coupon.validFrom);
            const to = formatDate(coupon.validTo);
            const canDeactivate =
              coupon.isActive && coupon.computedStatus !== "EXPIRED";
            return (
              <article
                key={coupon.id}
                className="border-border-light bg-surface-light flex flex-col rounded-md border p-5 transition-shadow hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-2">
                  <Badge
                    variant="muted"
                    tone={statusTone[coupon.computedStatus]}
                    size="sm"
                  >
                    {statusLabel[coupon.computedStatus]}
                  </Badge>
                  <span className="text-heading text-primary font-extrabold">
                    {coupon.discountType === "PERCENT"
                      ? `${coupon.discountValue}%`
                      : `₹${coupon.discountValue}`}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => copy(coupon.code)}
                  className="text-large text-text-primary hover:text-primary focus-visible:ring-primary group mt-3 inline-flex items-center gap-2 self-start rounded-sm font-mono font-bold tracking-wide focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                  aria-label={`Copy code ${coupon.code}`}
                >
                  {coupon.code}
                  <Icon
                    icon={Copy}
                    size="sm"
                    className="opacity-40 transition-opacity group-hover:opacity-100"
                  />
                </button>
                <p className="text-small text-text-secondary">
                  {coupon.discountType === "PERCENT"
                    ? "Percent off the ticket price"
                    : "Fixed amount off"}
                  {(from || to) &&
                    ` · ${from ?? "now"} → ${to ?? "no end date"}`}
                </p>

                <div className="mt-4">
                  <div className="text-small mb-1 flex justify-between">
                    <span className="text-text-secondary">Redeemed</span>
                    <span className="text-text-primary font-semibold tabular-nums">
                      {used}
                      {max !== undefined ? ` / ${max}` : " · no limit"}
                    </span>
                  </div>
                  {max !== undefined ? (
                    <Progress
                      value={pct}
                      tone={pct >= 100 ? "warning" : "secondary"}
                      label="Redemptions used"
                    />
                  ) : (
                    <div className="bg-bg-light h-2 rounded-full" />
                  )}
                </div>

                {canDeactivate && (
                  <div className="border-border-light mt-4 flex justify-end border-t pt-3">
                    <Button
                      variant="danger-ghost"
                      size="sm"
                      onClick={() => setToDeactivate(coupon)}
                    >
                      Deactivate
                    </Button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      <Modal
        open={creating}
        onClose={() => (saving ? undefined : setCreating(false))}
        title="New coupon"
        footer={
          <>
            <Button
              variant="secondary"
              size="sm"
              disabled={saving}
              onClick={() => setCreating(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={saving}
              onClick={handleCreate}
            >
              Create coupon
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="bg-primary-light rounded-md px-4 py-3 text-center">
            <p className="text-large text-primary font-mono font-bold">
              {form.code || "CODE"}
            </p>
            <p className="text-small text-text-secondary">{preview}</p>
          </div>

          <FormField label="Code" htmlFor="coupon-code">
            <div className="flex gap-2">
              <Input
                id="coupon-code"
                value={form.code}
                onChange={(e) => setField("code", e.target.value.toUpperCase())}
                placeholder="SAVE20"
                disabled={saving}
              />
              <Button
                variant="secondary"
                onClick={() => setField("code", generateCouponCode())}
                disabled={saving}
                aria-label="Generate a random code"
              >
                <Icon icon={RefreshCw} size="sm" />
              </Button>
            </div>
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Type" htmlFor="coupon-type">
              <Select
                id="coupon-type"
                value={form.type}
                onChange={(e) =>
                  setField("type", e.target.value as "PERCENT" | "FIXED")
                }
                disabled={saving}
              >
                <option value="PERCENT">Percent off</option>
                <option value="FIXED">Fixed ₹ off</option>
              </Select>
            </FormField>
            <FormField label="Value" htmlFor="coupon-value">
              <Input
                id="coupon-value"
                type="number"
                min={0}
                value={form.value}
                onChange={(e) => setField("value", e.target.value)}
                placeholder={form.type === "PERCENT" ? "20" : "500"}
                disabled={saving}
              />
            </FormField>
          </div>

          <FormField label="Max redemptions" htmlFor="coupon-max">
            <Input
              id="coupon-max"
              type="number"
              min={1}
              value={form.max}
              onChange={(e) => setField("max", e.target.value)}
              placeholder="Unlimited"
              disabled={saving}
            />
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Valid from" htmlFor="coupon-from">
              <Input
                id="coupon-from"
                type="date"
                value={form.from}
                onChange={(e) => setField("from", e.target.value)}
                disabled={saving}
              />
            </FormField>
            <FormField label="Valid to" htmlFor="coupon-to">
              <Input
                id="coupon-to"
                type="date"
                value={form.to}
                onChange={(e) => setField("to", e.target.value)}
                disabled={saving}
              />
            </FormField>
          </div>

          {formError && (
            <p role="alert" className="text-small text-danger">
              {formError}
            </p>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={toDeactivate !== null}
        title="Deactivate this coupon?"
        confirmLabel="Deactivate"
        cancelLabel="Keep active"
        busy={deactivating}
        onConfirm={confirmDeactivate}
        onClose={() => setToDeactivate(null)}
      >
        <p>
          <span className="font-mono font-semibold">{toDeactivate?.code}</span>{" "}
          will stop working at checkout straight away. Past redemptions are
          kept.
        </p>
      </ConfirmDialog>
    </div>
  );
}
