"use client";

import { FormEvent, useState } from "react";
import NextLink from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, PasswordInput } from "@/components/atoms";
import { FormField, PasswordStrengthMeter } from "@/components/molecules";
import { resetPassword } from "@/lib/api/auth";
import { hashPassword } from "@/lib/auth/hash-password";
import { isPasswordValid } from "@/lib/auth/password-strength";
import { ApiError } from "@/lib/api/client";

const linkClasses =
  "text-primary text-sm font-medium underline-offset-2 hover:underline";

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!token) {
    return (
      <div className="flex flex-col gap-4 text-center">
        <p className="text-danger text-body">
          This reset link is invalid or missing.
        </p>
        <NextLink href="/forgot-password" className={linkClasses}>
          Request a new reset link
        </NextLink>
      </div>
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isPasswordValid(password)) {
      setError("Password does not meet the requirements below");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await resetPassword(token as string, await hashPassword(password));
      router.push("/sign-in");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not reset password",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <FormField label="New password" htmlFor="password">
        <PasswordInput
          id="password"
          autoComplete="new-password"
          placeholder="••••••••"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </FormField>

      <PasswordStrengthMeter password={password} />

      <FormField label="Confirm new password" htmlFor="confirm-password">
        <PasswordInput
          id="confirm-password"
          autoComplete="new-password"
          placeholder="••••••••"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          required
        />
      </FormField>

      {error && (
        <p role="alert" className="text-danger text-small">
          {error}
        </p>
      )}

      <Button
        type="submit"
        variant="primary"
        className="w-full"
        loading={submitting}
      >
        Save new password
      </Button>
    </form>
  );
}
