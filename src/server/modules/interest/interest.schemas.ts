import { z } from "zod";

// API contract for "I'm interested". Shared with src/lib/api/interest.ts.

// Optional leading "+" then 7–15 digits. Format only — the phone is never
// OTP/SMS-verified. Clients strip spaces/dashes/parens before sending.
export const phoneSchema = z
  .string()
  .regex(/^\+?[0-9]{7,15}$/, "Enter a valid phone number");

// POST /api/v1/events/:id/interest (public). Signed in → the session's
// account is used and the body is ignored. Guest → `email` is required and
// must have passed the guest OTP (POST /auth/guest-otp + verify) recently.
export const expressInterestSchema = z.object({
  email: z.email().max(255).optional(),
  phone: phoneSchema.optional(),
});

export type ExpressInterestBody = z.infer<typeof expressInterestSchema>;
