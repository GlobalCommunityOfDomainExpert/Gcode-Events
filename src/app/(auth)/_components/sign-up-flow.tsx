"use client";

import { ReactNode, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check } from "lucide-react";
import { AuthHeader } from "./auth-header";
import { AccountDetails, StepAccountDetails } from "./step-account-details";
import { StepVerifyOtp } from "./step-verify-otp";
import {
  StakeholderRole,
  StepSelectStakeholder,
} from "./step-select-stakeholder";
import { useRedirectTo } from "./use-redirect-to";
import { selectRole, signUp } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";

type Step = 0 | 1 | 2;

const STEP_LABELS = ["Account", "Verify email", "Your role"] as const;

/** Compact 3-step progress bar shown above the sign-up form. */
function SignUpProgress({ current }: { current: Step }) {
  return (
    <ol className="mb-8 grid grid-cols-3 gap-2" aria-label="Sign-up progress">
      {STEP_LABELS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} aria-current={active ? "step" : undefined}>
            <span
              className={`block h-1 rounded-full transition-colors ${
                done || active ? "bg-primary" : "bg-bg-light"
              }`}
            />
            <span
              className={`text-small mt-2 flex items-center gap-1 font-medium ${
                active ? "text-text-primary" : "text-text-secondary"
              }`}
            >
              {done && <Check className="text-success size-3.5" aria-hidden />}
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function SignUpFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isOauth = searchParams.get("oauth") === "1";
  // Only used to decide which step to show; the account itself comes from
  // the session cookie (user ids are too long for Number anyway).
  const oauthUserId = isOauth ? searchParams.get("userId") : null;
  const oauthEmail = isOauth ? (searchParams.get("email") ?? "") : "";
  // Carried through from /sign-in (or an invite link) so people land back
  // where they started once the account is set up.
  const redirectTo = useRedirectTo();

  const [stepIndex, setStepIndex] = useState<Step>(0);
  const [account, setAccount] = useState<AccountDetails | null>(null);
  const [signedUp, setSignedUp] = useState(false);
  const [role, setRole] = useState<StakeholderRole>("expert");
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);

  const effectiveStepIndex: Step = oauthUserId !== null ? 2 : stepIndex;
  const canComplete = oauthUserId !== null || signedUp;

  async function handleAccountSubmit(details: AccountDetails) {
    await signUp(
      details.email,
      details.fullName,
      details.phone,
      details.password,
    );
    setAccount(details);
    setSignedUp(true);
    setStepIndex(1);
  }

  async function handleComplete() {
    if (!canComplete) return;
    setCompleting(true);
    setCompleteError(null);
    try {
      await selectRole(account?.email ?? oauthEmail, role);
      router.push(redirectTo);
    } catch (err) {
      setCompleteError(
        err instanceof ApiError ? err.message : "Could not complete setup",
      );
    } finally {
      setCompleting(false);
    }
  }

  const headers: Record<Step, { title: string; subtitle: ReactNode }> = {
    0: {
      title: "Create your account",
      subtitle: "Join GCODE to book events, get tickets and meet experts.",
    },
    1: {
      title: "Check your email",
      subtitle: (
        <>
          We sent a 6-digit code to{" "}
          <span className="text-text-primary font-medium">
            {account?.email}
          </span>
          .
        </>
      ),
    },
    2: {
      title: "Who are you?",
      subtitle: "Tell us how you'll use GCODE so we can tailor it for you.",
    },
  };

  return (
    <>
      {/* Google sign-ups skip straight to the role step, so no progress bar */}
      {oauthUserId === null && <SignUpProgress current={effectiveStepIndex} />}

      <AuthHeader {...headers[effectiveStepIndex]} />

      {effectiveStepIndex === 0 && (
        <StepAccountDetails
          onSubmit={handleAccountSubmit}
          redirectTo={redirectTo}
        />
      )}
      {effectiveStepIndex === 1 && account !== null && (
        <StepVerifyOtp
          email={account.email}
          onVerified={() => setStepIndex(2)}
        />
      )}
      {effectiveStepIndex === 2 && (
        <StepSelectStakeholder
          email={account?.email ?? oauthEmail}
          value={role}
          onChange={setRole}
          onComplete={handleComplete}
          submitting={completing}
          error={completeError}
        />
      )}
    </>
  );
}
