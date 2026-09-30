"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Compass,
  Mail,
  Phone,
  Tag,
  Ticket,
  User,
} from "lucide-react";
import {
  Button,
  Card,
  Checkbox,
  Icon,
  Input,
  Link,
} from "@/components/atoms";
import {
  Banner,
  Breadcrumb,
  CheckoutSummary,
  FormField,
  NotFoundState,
  SelectableCard,
} from "@/components/molecules";
import { useEvent } from "@/hooks/use-event";
import { registerForEvent } from "@/lib/api/participants";
import { createRazorpayOrder, verifyRazorpayPayment } from "@/lib/api/payments";
import { validateCoupon } from "@/lib/api/coupons";
import { submitUpiClaim } from "@/lib/api/upi-claims";
import { ValidateCouponResponse } from "@/lib/api/types";
import { ApiError } from "@/lib/api/client";
import { getSession } from "@/lib/auth/session";
import { isRegistrationOpen, RegistrationCategory } from "@/lib/event";
import {
  loadRazorpayCheckout,
  openRazorpayCheckout,
} from "@/lib/payments/razorpay";
import { VerifyEmailModal } from "./_components/verify-email-modal";
import { RegisterSkeleton } from "./_components/register-skeleton";

type Category = "ATTENDEE" | "PARTICIPANT";

// Signed-in users book by user_id (from the JWT) — the backend already has
// their account, so there's nothing to ask. Guests (no session) go through
// find-or-create-by-email, same as always, so full name + email are only
// collected in that branch.
export default function EventRegisterPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { event, status } = useEvent(params.id);
  const session = getSession();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  // Kept as free text while typing (see clampQuantity) — clamping on every
  // keystroke snaps a cleared/partial field back to "1", making it
  // impossible to type a second digit.
  const [quantityInput, setQuantityInput] = useState("1");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  // Tracks which email has actually passed OTP verification — cleared
  // implicitly whenever the typed email no longer matches it, so editing
  // the email after verifying forces a re-verify.
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null);
  const [showVerifyModal, setShowVerifyModal] = useState(false);

  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] =
    useState<ValidateCouponResponse | null>(null);
  const [couponError, setCouponError] = useState("");
  const [applyingCoupon, setApplyingCoupon] = useState(false);

  const [showUpiClaim, setShowUpiClaim] = useState(false);
  const [utr, setUtr] = useState("");
  const [upiClaimSubmitting, setUpiClaimSubmitting] = useState(false);
  const [upiClaimSubmitted, setUpiClaimSubmitted] = useState(false);
  const [upiClaimError, setUpiClaimError] = useState("");

  // Step 1 (pass-type select) only shows when BOTH categories are enabled —
  // otherwise skip straight to details with whichever one is enabled
  // (unchanged from before this feature when Attendee was the only option).
  // Both categories are independently toggleable by the organizer at any
  // time (wizard, or a runtime open/close control), so this is re-derived
  // from live event state, not assumed fixed for the event's lifetime.
  // A `?category=` param (e.g. from a pass card on the event detail page)
  // means the user already chose — skip the picker even when both are
  // enabled. Only auto-advance once, so the user can still go back to
  // "select" via the picker without this effect snapping them forward again.
  const [step, setStep] = useState<"select" | "details">("details");
  const [category, setCategory] = useState<Category>("ATTENDEE");
  const initializedStep = useRef(false);

  // What quantity/category appliedCoupon was actually priced for — if either
  // changes afterward, the discount is stale until re-applied (derived here
  // rather than reset via an effect, so it never scales a discount that was
  // only validated for a different total).
  const [couponValidatedFor, setCouponValidatedFor] = useState<{
    quantity: number;
    category: Category;
  } | null>(null);

  useEffect(() => {
    if (event && !initializedStep.current) {
      initializedStep.current = true;
      const requested = searchParams.get("category");
      const requestedCategory: Category | null =
        requested === "PARTICIPANT" && event.participantRegistration.enabled
          ? "PARTICIPANT"
          : requested === "ATTENDEE" && event.attendeeRegistration.enabled
            ? "ATTENDEE"
            : null;

      // One-time initialization from the URL's ?category= param (or the
      // fallback pass-picker step) once `event` loads — the ref guard above
      // already prevents this from re-running and fighting the user's own
      // later choice.
      if (requestedCategory) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setCategory(requestedCategory);
      } else if (
        event.attendeeRegistration.enabled &&
        event.participantRegistration.enabled
      ) {
        setStep("select");
      } else if (event.participantRegistration.enabled) {
        setCategory("PARTICIPANT");
      }
    }
  }, [event, searchParams]);

  if (status === "loading") {
    return <RegisterSkeleton />;
  }

  if (!event) {
    return (
      <NotFoundState
        icon={Compass}
        title="Event not found"
        description="This event may not exist, or it couldn't be loaded."
        actionHref="/events"
        actionLabel="Browse Events"
      />
    );
  }

  if (
    !event.attendeeRegistration.enabled &&
    !event.participantRegistration.enabled
  ) {
    return (
      <NotFoundState
        icon={Compass}
        title="Registration Closed"
        description="This event isn't accepting new registrations right now."
        actionHref={`/events/${event.id}`}
        actionLabel="Back to Event"
      />
    );
  }

  const breadcrumbRow = (
    <div className="flex items-center justify-between gap-3">
      <Breadcrumb
        items={[
          { label: "Events", href: "/events" },
          { label: event.type, href: "/events" },
          { label: event.title, href: `/events/${event.id}` },
          { label: "Register" },
        ]}
      />
      <Button
        variant="secondary"
        size="sm"
        onClick={() => router.back()}
        className="shrink-0"
      >
        <Icon icon={ArrowLeft} size="sm" /> Back
      </Button>
    </div>
  );

  const selected: RegistrationCategory =
    category === "PARTICIPANT"
      ? event.participantRegistration
      : event.attendeeRegistration;

  // Whichever is stricter: remaining capacity for the selected category, or
  // this category's own per-booking cap (Attendee and Participant passes
  // now have independent caps). Either may be unset (no limit).
  const maxQuantity = [selected.spotsLeft, selected.maxTicketsPerRegistration]
    .filter((n): n is number => n !== undefined)
    .reduce((min, n) => Math.min(min, n), Infinity);
  const soldOut = maxQuantity <= 0;
  // Deep-linking to ?category=X shouldn't bypass that pass's own window —
  // same check the event detail page uses to grey the pass out.
  const registrationWindowClosed = !isRegistrationOpen(selected);

  function clampQuantity(raw: number): number {
    const n = Number.isFinite(raw) ? Math.trunc(raw) : 1;
    const withMin = Math.max(n, 1);
    return Number.isFinite(maxQuantity)
      ? Math.min(withMin, maxQuantity)
      : withMin;
  }

  const isPaid = selected.price > 0;
  const currentQuantity = clampQuantity(Number(quantityInput));
  const total = selected.price * currentQuantity;
  // A coupon only counts while it's still priced for the current
  // quantity/category — changing either after applying makes it stale
  // rather than silently scaling a discount that was validated elsewhere.
  const couponIsStale =
    appliedCoupon !== null &&
    couponValidatedFor !== null &&
    (couponValidatedFor.quantity !== currentQuantity ||
      couponValidatedFor.category !== category);
  const effectiveCoupon = couponIsStale ? null : appliedCoupon;
  const displayTotal = effectiveCoupon ? effectiveCoupon.final_amount : total;

  async function handleApplyCoupon() {
    const trimmed = couponCode.trim();
    if (!trimmed) return;
    if (!session && !email.trim()) {
      setCouponError("Enter your email above first.");
      return;
    }
    setApplyingCoupon(true);
    setCouponError("");
    try {
      const result = await validateCoupon(
        params.id,
        trimmed,
        identityPayload(),
        category,
        currentQuantity,
      );
      setAppliedCoupon(result);
      setCouponValidatedFor({ quantity: currentQuantity, category });
    } catch (err) {
      setAppliedCoupon(null);
      setCouponError(
        err instanceof ApiError ? err.message : "Couldn't apply that coupon.",
      );
    } finally {
      setApplyingCoupon(false);
    }
  }

  async function handleSubmitUpiClaim() {
    const trimmedUtr = utr.trim();
    if (!trimmedUtr) {
      setUpiClaimError("Enter the UTR from your UPI app.");
      return;
    }
    const claimEmail = session?.email ?? email.trim();
    const claimName = session?.fullName ?? `${firstName.trim()} ${lastName.trim()}`.trim();
    if (!claimEmail || !claimName) {
      setUpiClaimError("Enter your name and email above first.");
      return;
    }
    setUpiClaimSubmitting(true);
    setUpiClaimError("");
    try {
      await submitUpiClaim(params.id, {
        email: claimEmail,
        full_name: claimName,
        utr: trimmedUtr,
        amount_claimed: displayTotal,
      });
      setUpiClaimSubmitted(true);
    } catch (err) {
      setUpiClaimError(
        err instanceof ApiError ? err.message : "Couldn't submit that claim.",
      );
    } finally {
      setUpiClaimSubmitting(false);
    }
  }

  // Signed-in -> book by user_id, nothing else needed. Guest -> full name +
  // email + phone, same as always.
  function identityPayload():
    { user_id: string } | { email: string; full_name: string; phone: string } {
    if (session) return { user_id: session.userId };
    return {
      email: email.trim(),
      full_name: `${firstName.trim()} ${lastName.trim()}`.trim(),
      phone: phone.trim(),
    };
  }

  function submit() {
    const nextFieldErrors: Record<string, string> = {};
    if (!session) {
      if (!firstName.trim())
        nextFieldErrors["first-name"] = "First name is required.";
      if (!lastName.trim())
        nextFieldErrors["last-name"] = "Last name is required.";
      if (!email.trim()) nextFieldErrors.email = "Email address is required.";
      if (!phone.trim()) nextFieldErrors.phone = "Phone number is required.";
    }
    if (Object.keys(nextFieldErrors).length) {
      setFieldErrors(nextFieldErrors);
      setError("");
      const firstInvalidId = Object.keys(nextFieldErrors)[0];
      if (window.matchMedia("(max-width: 767px)").matches) {
        window.setTimeout(() => {
          const input = document.getElementById(firstInvalidId);
          input?.scrollIntoView({ behavior: "smooth", block: "center" });
          input?.focus({ preventScroll: true });
        }, 0);
      }
      return;
    }
    setFieldErrors({});
    if (!agreedToTerms) {
      setError("Please accept the Code of Conduct.");
      return;
    }
    if (
      !session &&
      event?.id !== "422" &&
      email.trim() !== verifiedEmail
    ) {
      setError("");
      setShowVerifyModal(true);
      return;
    }
    proceed();
  }

  async function proceed() {
    const quantity = clampQuantity(Number(quantityInput));
    setSubmitting(true);
    setError("");
    try {
      if (isPaid) {
        await payWithRazorpay(quantity);
      } else {
        const { participant_id } = await registerForEvent(params.id, {
          ...identityPayload(),
          quantity,
          category,
        });
        router.push(`/events/${params.id}/registered?pid=${participant_id}`);
      }
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Registration failed. Please try again.",
      );
      setSubmitting(false);
    }
  }

  function handleEmailVerified() {
    setVerifiedEmail(email.trim());
    setShowVerifyModal(false);
    proceed();
  }

  // Order is created (and later verified) server-side, where the Razorpay
  // key secret lives — this only opens Checkout and hands the signed
  // response back for the backend to verify before it creates the ticket.
  // A coupon that fully covers the price makes the backend skip Razorpay
  // and register the participant directly (see FreeRegistrationApi) — that
  // branch is handled here before ever touching Checkout.js.
  async function payWithRazorpay(quantity: number) {
    const order = await createRazorpayOrder(params.id, {
      ...identityPayload(),
      quantity,
      category,
      coupon_code: effectiveCoupon ? couponCode.trim() : undefined,
    });

    if ("free" in order) {
      router.push(`/events/${params.id}/registered?pid=${order.participant_id}`);
      return;
    }

    await loadRazorpayCheckout();
    const prefillName = session ? session.fullName : firstName.trim();
    const prefillEmail = session?.email ?? (email.trim() || undefined);
    await new Promise<void>((resolve, reject) => {
      openRazorpayCheckout({
        key: order.key_id,
        order_id: order.order_id,
        amount: order.amount,
        currency: order.currency,
        name: "GCODE",
        description: event!.title,
        prefill: { name: prefillName, email: prefillEmail },
        handler: (response) => {
          verifyRazorpayPayment({
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
          })
            .then(({ participant_id }) => {
              router.push(
                `/events/${params.id}/registered?pid=${participant_id}`,
              );
              resolve();
            })
            .catch(reject);
        },
        modal: {
          // User closed the Checkout modal without paying — not an error.
          ondismiss: () => {
            setSubmitting(false);
            resolve();
          },
        },
      });
    });
  }

  if (
    step === "select" &&
    event.attendeeRegistration.enabled &&
    event.participantRegistration.enabled
  ) {
    const options: { value: Category; data: RegistrationCategory }[] = [
      { value: "ATTENDEE", data: event.attendeeRegistration },
      { value: "PARTICIPANT", data: event.participantRegistration },
    ];
    return (
      <div className="mx-auto max-w-xl space-y-4">
        {breadcrumbRow}
        <div>
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-large text-text-primary min-w-0 font-bold">
              How would you like to join?
            </h1>
            <Link
              href={`/events/${event.id}?from=register&category=${category}`}
              variant="primary"
              size="sm"
              className="shrink-0 text-primary"
            >
              View More...
            </Link>
          </div>
          <p className="text-small text-text-secondary">
            Select your primary pass type below.
          </p>
        </div>
        <Card padding="md" className="space-y-3">
          {options.map(({ value, data }) => (
            <SelectableCard
              key={value}
              layout="horizontal"
              title={data.label}
              subtitle={data.description || undefined}
              metaItems={[
                { icon: Tag, label: data.priceLabel, tone: "success" as const },
                data.spotsLeft !== undefined
                  ? {
                      icon: Ticket,
                      label: `${data.spotsLeft} left`,
                      tone: "warning" as const,
                    }
                  : undefined,
              ].filter(
                (item): item is NonNullable<typeof item> => item !== undefined,
              )}
              selected={category === value}
              onSelect={() => setCategory(value)}
            />
          ))}
          <Button
            variant="primary"
            className="w-full"
            onClick={() => setStep("details")}
          >
            Confirm Selection <Icon icon={ArrowRight} size="sm" />
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      {breadcrumbRow}
      <div>
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-large text-text-primary min-w-0 font-bold">
            Register for {event.title}
          </h1>
          <Link
            href={`/events/${event.id}?from=register&category=${category}`}
            variant="primary"
            size="sm"
            className="shrink-0 text-primary"
          >
            View More...
          </Link>
        </div>
        <p className="text-small text-text-secondary">
          {event.date} · {event.time} · {event.location}
        </p>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}

      {registrationWindowClosed ? (
        <Banner tone="danger">
          Registration for {selected.label} isn&apos;t open right now.
        </Banner>
      ) : soldOut ? (
        <Banner tone="danger">
          This event is sold out — no spots remaining.
        </Banner>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="space-y-4">
            <Card padding="md" className="space-y-4">
              {session ? (
                <p className="text-body text-text-primary">
                  Registering as{" "}
                  <span className="font-semibold">{session.fullName}</span>
                </p>
              ) : (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      label="First Name"
                      htmlFor="first-name"
                      required
                      error={fieldErrors["first-name"]}
                    >
                      <Input
                        id="first-name"
                        icon={User}
                        value={firstName}
                        error={!!fieldErrors["first-name"]}
                        onChange={(e) => {
                          setFirstName(e.target.value);
                          if (e.target.value.trim())
                            setFieldErrors((prev) => ({
                              ...prev,
                              "first-name": "",
                            }));
                        }}
                        placeholder="First name"
                      />
                    </FormField>
                    <FormField
                      label="Last Name"
                      htmlFor="last-name"
                      required
                      error={fieldErrors["last-name"]}
                    >
                      <Input
                        id="last-name"
                        icon={User}
                        value={lastName}
                        error={!!fieldErrors["last-name"]}
                        onChange={(e) => {
                          setLastName(e.target.value);
                          if (e.target.value.trim())
                            setFieldErrors((prev) => ({
                              ...prev,
                              "last-name": "",
                            }));
                        }}
                        placeholder="Last name"
                      />
                    </FormField>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      label="Email Address"
                      htmlFor="email"
                      required
                      error={fieldErrors.email}
                    >
                      <Input
                        id="email"
                        type="email"
                        icon={Mail}
                        value={email}
                        error={!!fieldErrors.email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          if (e.target.value.trim())
                            setFieldErrors((prev) => ({ ...prev, email: "" }));
                        }}
                        placeholder="you@example.com"
                      />
                    </FormField>
                    <FormField
                      label="Phone Number"
                      htmlFor="phone"
                      required
                      error={fieldErrors.phone}
                    >
                      <Input
                        id="phone"
                        type="tel"
                        icon={Phone}
                        value={phone}
                        error={!!fieldErrors.phone}
                        onChange={(e) => {
                          setPhone(e.target.value);
                          if (e.target.value.trim())
                            setFieldErrors((prev) => ({ ...prev, phone: "" }));
                        }}
                        placeholder="9876543210"
                      />
                    </FormField>
                  </div>
                </>
              )}
              {maxQuantity !== 1 && (
                <FormField
                  label="Number of Tickets"
                  htmlFor="quantity"
                  hint={
                    Number.isFinite(maxQuantity)
                      ? `Up to ${maxQuantity} available.`
                      : undefined
                  }
                >
                  <Input
                    id="quantity"
                    type="number"
                    icon={Ticket}
                    min={1}
                    max={Number.isFinite(maxQuantity) ? maxQuantity : undefined}
                    value={quantityInput}
                    onChange={(e) => setQuantityInput(e.target.value)}
                    onBlur={() =>
                      setQuantityInput(
                        String(clampQuantity(Number(quantityInput))),
                      )
                    }
                  />
                </FormField>
              )}
              {!session && (
                <p className="text-small text-text-secondary">
                  No account needed — you can create a password later to manage
                  your registrations.
                </p>
              )}
            </Card>

            <Card padding="md">
              <Checkbox
                id="agree-terms"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                label="I understand that my personal information will be used only for the administration of this event & will be governed under the DPDP act compliances of gcode.in"
              />
            </Card>
          </div>

          <div className="space-y-3">
            {isPaid && (
              <Card padding="md" className="space-y-2">
                <FormField label="Coupon code" htmlFor="coupon-code-input">
                  <div className="flex gap-2">
                    <Input
                      id="coupon-code-input"
                      value={couponCode}
                      onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                      placeholder="SAVE20"
                      disabled={applyingCoupon || !!effectiveCoupon}
                    />
                    {effectiveCoupon ? (
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setAppliedCoupon(null);
                          setCouponValidatedFor(null);
                          setCouponCode("");
                        }}
                      >
                        Remove
                      </Button>
                    ) : (
                      <Button
                        variant="secondary"
                        disabled={!couponCode.trim() || applyingCoupon}
                        onClick={handleApplyCoupon}
                      >
                        {applyingCoupon ? "Checking…" : "Apply"}
                      </Button>
                    )}
                  </div>
                </FormField>
                {couponError && (
                  <p className="text-small text-danger">{couponError}</p>
                )}
                {couponIsStale && (
                  <p className="text-small text-warning">
                    Ticket count changed — re-apply the coupon.
                  </p>
                )}
                {effectiveCoupon && (
                  <p className="text-small text-success">
                    Coupon applied —{" "}
                    {effectiveCoupon.final_amount === 0
                      ? "your registration is free!"
                      : `₹${effectiveCoupon.original_amount - effectiveCoupon.final_amount} off`}
                  </p>
                )}
              </Card>
            )}

            <CheckoutSummary
              items={[
                { label: "Event", value: event.title },
                {
                  label: "Pass Type",
                  value: `${quantityInput}x ${selected.label}`,
                },
                ...(effectiveCoupon
                  ? [
                      {
                        label: `Coupon (${couponCode.trim()})`,
                        value: `-₹${effectiveCoupon.original_amount - effectiveCoupon.final_amount}`,
                      },
                    ]
                  : []),
              ]}
              total={`₹${displayTotal}`}
              actionLabel={
                isPaid
                  ? displayTotal === 0
                    ? "Register for Free"
                    : "Pay & Register"
                  : "Complete Registration"
              }
              onAction={submit}
              processing={submitting}
            />

            {isPaid && (
              <Card padding="md" className="space-y-2">
                {upiClaimSubmitted ? (
                  <Banner tone="success">
                    Claim submitted — you&apos;ll be registered once the
                    organizer confirms your payment.
                  </Banner>
                ) : showUpiClaim ? (
                  <div className="space-y-2">
                    <FormField
                      label="UPI transaction reference (UTR)"
                      htmlFor="utr"
                    >
                      <Input
                        id="utr"
                        value={utr}
                        onChange={(e) => setUtr(e.target.value)}
                        placeholder="e.g. 123456789012"
                        disabled={upiClaimSubmitting}
                      />
                    </FormField>
                    {upiClaimError && (
                      <p className="text-small text-danger">{upiClaimError}</p>
                    )}
                    <div className="flex gap-2">
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={upiClaimSubmitting}
                        onClick={handleSubmitUpiClaim}
                      >
                        {upiClaimSubmitting ? "Submitting…" : "Submit Claim"}
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setShowUpiClaim(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="text-small text-text-secondary underline"
                    onClick={() => setShowUpiClaim(true)}
                  >
                    Already paid via UPI QR at the venue?
                  </button>
                )}
              </Card>
            )}
          </div>
        </div>
      )}

        <VerifyEmailModal
          open={showVerifyModal}
          email={email.trim()}
          fullName={`${firstName.trim()} ${lastName.trim()}`.trim()}
          onClose={() => setShowVerifyModal(false)}
          onVerified={handleEmailVerified}
        />
    </div>
  );
}
