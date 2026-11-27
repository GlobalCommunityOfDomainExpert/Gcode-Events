import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthHeader } from "../_components/auth-header";
import { SignInForm } from "../_components/sign-in-form";

export const metadata: Metadata = { title: "Sign in · GCODE Events" };

export default function SignInPage() {
  return (
    <>
      <AuthHeader
        title="Welcome back"
        subtitle="Sign in to book events, see your tickets and join live rooms."
      />
      <Suspense fallback={null}>
        <SignInForm />
      </Suspense>
    </>
  );
}
