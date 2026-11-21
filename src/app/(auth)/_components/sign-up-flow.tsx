"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Modal } from "@/components/molecules";
import { AuthCard } from "./auth-card";
import { AccountDetails, StepAccountDetails } from "./step-account-details";
import { StepVerifyOtp } from "./step-verify-otp";
import {
  StakeholderRole,
  StepSelectStakeholder,
} from "./step-select-stakeholder";
import { selectRole, signUp } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";

type Step = 0 | 1 | 2;

export function SignUpFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isOauth = searchParams.get("oauth") === "1";
  // Only used to decide which step to show; the account itself comes from
  // the session cookie (user ids are too long for Number anyway).
  const oauthUserId = isOauth ? searchParams.get("userId") : null;
  const oauthEmail = isOauth ? (searchParams.get("email") ?? "") : "";
  // Same redirect-back convention as SignInForm — carried through from
  // /sign-in when the Google OAuth branch routes a brand-new user here to
  // pick a role first.
  const redirectParam = searchParams.get("redirect");
  const redirectTo =
    redirectParam && redirectParam.startsWith("/") && !redirectParam.startsWith("//")
      ? redirectParam
      : "/";

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

  const titles: Record<Step, { title: string; subtitle: string }> = {
    0: { title: "Create Account", subtitle: "Join the GCODE ecosystem today" },
    1: {
      title: "Verify Your Email",
      subtitle: "Enter the code we sent you",
    },
    2: {
      title: "Who are you?",
      subtitle: "Tell us how you'll be using GCODE",
    },
  };

  return (
    <Modal open onClose={() => router.back()} size="lg" bodyClassName="p-0">
      <AuthCard variant="modal" {...titles[effectiveStepIndex]}>
        {effectiveStepIndex === 0 && (
          <StepAccountDetails onSubmit={handleAccountSubmit} />
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
      </AuthCard>
    </Modal>
  );
}
