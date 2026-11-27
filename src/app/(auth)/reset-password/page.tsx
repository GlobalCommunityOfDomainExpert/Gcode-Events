import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthHeader } from "../_components/auth-header";
import { ResetPasswordForm } from "../_components/reset-password-form";

export const metadata: Metadata = { title: "Reset password · GCODE Events" };

export default function ResetPasswordPage() {
  return (
    <>
      <AuthHeader
        title="Set a new password"
        subtitle="Choose a strong password you haven't used before."
      />
      <Suspense fallback={null}>
        <ResetPasswordForm />
      </Suspense>
    </>
  );
}
