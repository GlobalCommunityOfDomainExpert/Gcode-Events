// Cashfree Payment Gateway standard checkout (checkout.js v3). Mirrors
// razorpay.ts: load the SDK once, then open checkout with a payment session the
// backend created (the app id/secret never reach the browser).

type CashfreeMode = "sandbox" | "production";

export interface CashfreeCheckoutResult {
  // Present when the customer closed the modal or the attempt failed.
  error?: { message?: string; code?: string };
  // Present when checkout redirected instead of staying in the modal; the
  // return_url flow (register page's ?cf_order_id handling) takes over.
  redirect?: boolean;
  // Present when the modal reports success. Never trusted on its own — the
  // backend re-verifies the order with Cashfree before registering anyone.
  paymentDetails?: { paymentMessage?: string };
}

interface CashfreeInstance {
  checkout(options: {
    paymentSessionId: string;
    redirectTarget?: "_modal" | "_self" | "_blank" | "_top";
  }): Promise<CashfreeCheckoutResult | undefined>;
}

declare global {
  interface Window {
    Cashfree?: (config: { mode: CashfreeMode }) => CashfreeInstance;
  }
}

const CHECKOUT_SCRIPT_SRC = "https://sdk.cashfree.com/js/v3/cashfree.js";

const MODE: CashfreeMode =
  process.env.NEXT_PUBLIC_CASHFREE_MODE === "production"
    ? "production"
    : "sandbox";

// What the backend calls the same thing: picks the TEST_ or CASHFREE_PROD_ credentials for the order.
export const CASHFREE_ENV: "test" | "prod" =
  MODE === "production" ? "prod" : "test";

let loadPromise: Promise<void> | undefined;

export function loadCashfreeCheckout(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Cashfree checkout requires a browser."));
  }
  if (window.Cashfree) return Promise.resolve();
  if (!loadPromise) {
    loadPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = CHECKOUT_SCRIPT_SRC;
      script.onload = () => resolve();
      script.onerror = () => {
        loadPromise = undefined;
        reject(new Error("Failed to load Cashfree checkout."));
      };
      document.body.appendChild(script);
    });
  }
  return loadPromise;
}

// Resolves when the modal closes (paid, failed, or dismissed). Callers must
// verify with the backend afterward rather than reading the result as truth.
export async function openCashfreeCheckout(
  paymentSessionId: string,
): Promise<CashfreeCheckoutResult> {
  if (!window.Cashfree) {
    throw new Error("Cashfree checkout script hasn't loaded yet.");
  }
  const cashfree = window.Cashfree({ mode: MODE });
  const result = await cashfree.checkout({
    paymentSessionId,
    redirectTarget: "_modal",
  });
  return result ?? {};
}
