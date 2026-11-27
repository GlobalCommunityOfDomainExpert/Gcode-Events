"use client";

import { FormEvent, useState } from "react";
import NextLink from "next/link";
import { ArrowLeft, MailCheck } from "lucide-react";
import { Button, Input } from "@/components/atoms";
import { FormField } from "@/components/molecules";
import { AuthHeader } from "./auth-header";
import { requestPasswordReset } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";

const backLink =
  "text-small text-text-secondary hover:text-text-primary mt-8 inline-flex items-center gap-1.5 font-medium transition-colors";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await requestPasswordReset(email);
      setSent(true);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not send reset link",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <>
        <span className="bg-success-light text-success mb-6 flex size-12 items-center justify-center rounded-full">
          <MailCheck className="size-6" aria-hidden />
        </span>
        <AuthHeader
          title="Check your inbox"
          subtitle={
            <>
              If <span className="text-text-primary font-medium">{email}</span>{" "}
              is registered, we&apos;ve sent it a link to reset your password.
            </>
          }
        />
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          onClick={() => setSent(false)}
        >
          Use a different email
        </Button>
        <NextLink href="/sign-in" className={backLink}>
          <ArrowLeft className="size-4" aria-hidden />
          Back to sign in
        </NextLink>
      </>
    );
  }

  return (
    <>
      <AuthHeader
        title="Forgot your password?"
        subtitle="Enter the email you signed up with and we'll send you a reset link."
      />
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <FormField label="Email" htmlFor="email">
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
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
          Send reset link
        </Button>
      </form>
      <NextLink href="/sign-in" className={backLink}>
        <ArrowLeft className="size-4" aria-hidden />
        Back to sign in
      </NextLink>
    </>
  );
}
