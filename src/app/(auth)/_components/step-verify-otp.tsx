"use client";

import { useState } from "react";
import { Button } from "@/components/atoms";
import { OtpInput } from "./otp-input";
import { verifyOtp } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";

const OTP_LENGTH = 6;

export interface StepVerifyOtpProps {
  email: string;
  onVerified: () => void;
}

export function StepVerifyOtp({ email, onVerified }: StepVerifyOtpProps) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  async function handleVerify() {
    setChecking(true);
    setError(null);
    try {
      await verifyOtp(email, code, "REGISTRATION");
      onVerified();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not verify code");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <OtpInput
        length={OTP_LENGTH}
        error={!!error}
        disabled={checking}
        onChange={setCode}
      />

      {error && <p className="text-danger text-small text-center">{error}</p>}

      <Button
        type="button"
        variant="primary"
        className="w-full"
        loading={checking}
        disabled={code.length !== OTP_LENGTH}
        onClick={handleVerify}
      >
        Verify email
      </Button>
    </div>
  );
}
