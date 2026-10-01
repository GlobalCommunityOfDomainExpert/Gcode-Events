// Which gateway paid registrations go through. Cashfree is the default; set
// NEXT_PUBLIC_PAYMENT_PROVIDER=razorpay to fall back to the legacy Razorpay
// flow (kept intact until Cashfree is validated). Build-time flag, so switching
// is an env change + restart/redeploy.
export type PaymentProvider = "razorpay" | "cashfree";

export const PAYMENT_PROVIDER: PaymentProvider =
  process.env.NEXT_PUBLIC_PAYMENT_PROVIDER === "razorpay"
    ? "razorpay"
    : "cashfree";
