"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/atoms";
import { Modal } from "@/components/molecules";
import { OtpInput } from "@/app/(auth)/_components/otp-input";
import { sendGuestOtp, verifyOtp } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";

const OTP_LENGTH = 6;
const GUEST_OTP_PURPOSE = "GUEST_CHECKOUT";

export interface VerifyEmailModalProps {
  open: boolean;
  email: string;
  fullName?: string;
  onClose: () => void;
  onVerified: () => void;
}

// Sends the OTP itself on open rather than requiring a separate "send" click
// from the caller — the register page just needs to show this and get a
// verified/cancelled result back.
export function VerifyEmailModal({
  open,
  email,
  fullName,
  onClose,
  onVerified,
}: VerifyEmailModalProps) {
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      setCode("");
      setError(null);
      setSending(true);
      try {
        await sendGuestOtp(email, fullName);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Could not send code");
      } finally {
        setSending(false);
      }
    })();
  }, [open, email, fullName]);

  async function handleVerify() {
    setChecking(true);
    setError(null);
    try {
      await verifyOtp(email, code, GUEST_OTP_PURPOSE);
      onVerified();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not verify code");
    } finally {
      setChecking(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Verify Your Email">
      <div className="flex flex-col gap-4">
        <p className="text-body text-text-secondary text-center">
          {sending
            ? `Sending a code to ${email}…`
            : `Enter the 6-digit code sent to ${email}`}
        </p>

        <OtpInput
          length={OTP_LENGTH}
          error={!!error}
          disabled={sending || checking}
          onChange={setCode}
        />

        {error && <p className="text-danger text-small text-center">{error}</p>}

        <Button
          type="button"
          variant="primary"
          className="w-full"
          loading={checking}
          disabled={sending || code.length !== OTP_LENGTH}
          onClick={handleVerify}
        >
          Verify & Continue
        </Button>
      </div>
    </Modal>
  );
}
