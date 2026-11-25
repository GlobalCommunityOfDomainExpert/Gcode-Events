"use client";

import NextLink from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Checkbox,
  Divider,
  Input,
  PasswordInput,
} from "@/components/atoms";
import { FormField, PasswordStrengthMeter } from "@/components/molecules";
import { GoogleButton } from "./google-button";
import { signInWithGoogle } from "@/lib/api/auth";
import {
  decodeGoogleEmail,
  useGoogleIdToken,
} from "@/lib/auth/use-google-id-token";
import { hashPassword } from "@/lib/auth/hash-password";
import { isPasswordValid } from "@/lib/auth/password-strength";
import { ApiError } from "@/lib/api/client";

const linkClasses =
  "text-primary text-sm font-medium underline-offset-2 hover:underline";

export interface AccountDetails {
  fullName: string;
  email: string;
  phone: string;
  password: string;
}

export interface StepAccountDetailsProps {
  onSubmit: (details: AccountDetails) => Promise<void>;
}

export function StepAccountDetails({ onSubmit }: StepAccountDetailsProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const { hiddenButton, requestGoogleIdToken } = useGoogleIdToken();

  const canSubmit =
    termsAccepted &&
    fullName.trim() !== "" &&
    email.trim() !== "" &&
    phone.trim() !== "" &&
    password !== "";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isPasswordValid(password)) {
      setError("Password does not meet the requirements below");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        fullName,
        email,
        phone,
        password: await hashPassword(password),
      });
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not create account",
      );
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
        router.push(`/sign-up?oauth=1&userId=${user.userId}&email=${email}`);
      } else {
        router.push("/");
      }
    } catch {
      setError("Could not sign in with Google");
    }
  }

  return (
    <>
      {hiddenButton}
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <FormField label="Full Name" required={true} htmlFor="name">
          <Input
            id="name"
            name="fullName"
            placeholder="John Doe"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            required
          />
        </FormField>
        <FormField label="Email" required={true} htmlFor="email">
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </FormField>
        <FormField label="Phone" required={true} htmlFor="phone">
          <Input
            id="phone"
            name="phone"
            type="tel"
            placeholder="9876543210"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            required
          />
        </FormField>
        <FormField label="Password" required={true} htmlFor="password">
          <PasswordInput
            id="password"
            name="password"
            placeholder="Create a strong password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </FormField>

        <PasswordStrengthMeter password={password} />

        <Checkbox
          id="terms"
          label="I agree to the Terms of Service and Privacy Policy"
          checked={termsAccepted}
          onChange={(event) => setTermsAccepted(event.target.checked)}
        />

        {error && <p className="text-danger text-small">{error}</p>}

        <Button
          type="submit"
          variant="primary"
          className="w-full"
          loading={submitting}
          disabled={!canSubmit}
        >
          Continue to Verify Email
        </Button>

        <div className="flex items-center gap-3">
          <Divider />
          <span className="text-small text-text-secondary">or</span>
          <Divider />
        </div>

        <GoogleButton onClick={handleGoogleClick} />
      </form>

      <p className="text-text-secondary mt-6 text-center text-sm">
        Already have an account?{" "}
        <NextLink href="/sign-in" className={linkClasses}>
          Sign in
        </NextLink>
      </p>
    </>
  );
}
