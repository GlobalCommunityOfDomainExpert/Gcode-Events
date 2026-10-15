"use client";

import { FormEvent, useState } from "react";
import { Mail, Phone } from "lucide-react";
import { Button, Input } from "@/components/atoms";
import { FormField, Modal } from "@/components/molecules";
import { submitEventEnquiry } from "@/lib/api/event-enquiries";
import { ApiError } from "@/lib/api/client";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_PATTERN = /^\+?[0-9]{7,15}$/;

function normalizePhone(phone: string): string {
  return phone.replace(/[^0-9+]/g, "");
}

interface EventEnquiryButtonProps {
  eventId: string;
  eventTitle: string;
}

export function EventEnquiryButton({
  eventId,
  eventTitle,
}: EventEnquiryButtonProps) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  function handleClose() {
    if (submitting) return;
    setOpen(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = email.trim();
    const normalizedPhone = normalizePhone(phone);
    const validEmail = EMAIL_PATTERN.test(normalizedEmail);
    const validPhone = PHONE_PATTERN.test(normalizedPhone);
    setEmailError(validEmail ? null : "Enter a valid email address");
    setPhoneError(validPhone ? null : "Enter a valid phone number");
    setSubmitError(null);
    if (!validEmail || !validPhone) return;

    setSubmitting(true);
    void submitEventEnquiry(eventId, {
      email: normalizedEmail,
      phone: normalizedPhone,
    })
      .then(() => setSubmitted(true))
      .catch((error: unknown) => {
        setSubmitError(
          error instanceof ApiError
            ? error.message
            : "We couldn't send your request. Please try again.",
        );
      })
      .finally(() => setSubmitting(false));
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Tell me more
      </Button>
      <Modal open={open} onClose={handleClose} title="Tell me more">
        {submitted ? (
          <div className="space-y-4" role="status">
            <p>
              Thanks for your interest in {eventTitle}. Our team will contact
              you with more details.
            </p>
            <Button variant="primary" onClick={handleClose}>
              Done
            </Button>
          </div>
        ) : (
          <form
            className="flex flex-col gap-4"
            noValidate
            onSubmit={handleSubmit}
          >
            <p className="text-body text-text-secondary">
              Leave your email and phone number and our team will contact you
              about {eventTitle}.
            </p>
            <FormField
              label="Email"
              htmlFor="event-enquiry-email"
              required
              error={emailError ?? undefined}
            >
              <Input
                id="event-enquiry-email"
                type="email"
                autoComplete="email"
                icon={Mail}
                placeholder="you@example.com"
                value={email}
                error={!!emailError}
                onChange={(event) => setEmail(event.target.value)}
                autoFocus
                required
              />
            </FormField>
            <FormField
              label="Phone Number"
              htmlFor="event-enquiry-phone"
              required
              error={phoneError ?? undefined}
            >
              <Input
                id="event-enquiry-phone"
                type="tel"
                autoComplete="tel"
                icon={Phone}
                placeholder="+91 98765 43210"
                value={phone}
                error={!!phoneError}
                onChange={(event) => setPhone(event.target.value)}
                required
              />
            </FormField>
            {submitError && (
              <p className="text-small text-danger" role="alert">
                {submitError}
              </p>
            )}
            <Button
              type="submit"
              variant="primary"
              className="w-full"
              loading={submitting}
            >
              Submit
            </Button>
          </form>
        )}
      </Modal>
    </>
  );
}
