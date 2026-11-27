import type { Metadata } from "next";
import { Suspense } from "react";
import { SignUpFlow } from "../_components/sign-up-flow";

export const metadata: Metadata = { title: "Create account · GCODE Events" };

export default function SignUpPage() {
  return (
    <Suspense fallback={null}>
      <SignUpFlow />
    </Suspense>
  );
}
