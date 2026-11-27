"use client";

import { FormEvent, useState } from "react";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { Button, Divider, Input, PasswordInput } from "@/components/atoms";
import { FormField } from "@/components/molecules";
import { GoogleButton } from "./google-button";
import { useRedirectTo, withRedirect } from "./use-redirect-to";
import { signIn, signInWithGoogle } from "@/lib/api/auth";
import {
  decodeGoogleEmail,
  useGoogleIdToken,
} from "@/lib/auth/use-google-id-token";
import { hashPassword } from "@/lib/auth/hash-password";
import { ApiError } from "@/lib/api/client";

const linkClasses =
  "text-primary text-sm font-medium underline-offset-2 hover:underline";

export function SignInForm() {
  const router = useRouter();
  const redirectTo = useRedirectTo();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { hiddenButton, requestGoogleIdToken } = useGoogleIdToken();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "");
    const password = String(data.get("password") ?? "");

    setSubmitting(true);
    setError(null);
    try {
      await signIn(email, await hashPassword(password));
      router.push(redirectTo);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not sign in");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogleClick() {
    setError(null);
    try {
      const idToken = await requestGoogleIdToken();
      const { user, needsRole } = await signInWithGoogle(idToken);
      if (needsRole) {
        const email = encodeURIComponent(decodeGoogleEmail(idToken));
        router.push(
          `/sign-up?oauth=1&userId=${user.userId}&email=${email}&redirect=${encodeURIComponent(redirectTo)}`,
        );
      } else {
        router.push(redirectTo);
      }
    } catch {
      setError("Could not sign in with Google");
    }
  }

  return (
    <>
      {hiddenButton}
      <GoogleButton onClick={handleGoogleClick} />

      <div className="my-6 flex items-center gap-3">
        <Divider />
        <span className="text-small text-text-secondary shrink-0">
          or sign in with email
        </span>
        <Divider />
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <FormField label="Email" htmlFor="email">
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            required
          />
        </FormField>
        <div className="flex flex-col gap-2">
          <FormField label="Password" htmlFor="password">
            <PasswordInput
              id="password"
              name="password"
              autoComplete="current-password"
              placeholder="••••••••"
              required
            />
          </FormField>
          <NextLink
            href="/forgot-password"
            className={`${linkClasses} self-end`}
          >
            Forgot password?
          </NextLink>
        </div>

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
          Sign in
        </Button>
      </form>

      <p className="text-text-secondary mt-8 text-center text-sm">
        New to GCODE?{" "}
        <NextLink
          href={withRedirect("/sign-up", redirectTo)}
          className={linkClasses}
        >
          Create an account
        </NextLink>
      </p>
    </>
  );
}
