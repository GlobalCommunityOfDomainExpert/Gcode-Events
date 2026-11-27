import type { Metadata } from "next";
import { ForgotPasswordForm } from "../_components/forgot-password-form";

export const metadata: Metadata = { title: "Forgot password · GCODE Events" };

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
