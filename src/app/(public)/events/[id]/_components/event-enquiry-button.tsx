"use client";

import { ChangeEvent, FormEvent, useRef, useState } from "react";
import { FaqAccordion } from "./faq-accordion";
import {
  ImagePlus,
  Mail,
  MessageCircle,
  Phone,
  X,
} from "lucide-react";
import { Button, Icon, Input, Textarea } from "@/components/atoms";
import { FormField, Modal } from "@/components/molecules";
import { submitEventEnquiry } from "@/lib/api/event-enquiries";
import { shrinkToDataUrl } from "@/lib/api/events";
import { ApiError } from "@/lib/api/client";
import type { EventFaq } from "@/lib/event";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_PATTERN = /^\+?[0-9]{7,15}$/;

// The questions people actually ask — one tap fills the box.
const TOPICS: { label: string; prompt: string }[] = [
  { label: "Who is it for?", prompt: "Is this a good fit for me if " },
  {
    label: "Pricing & refunds",
    prompt: "A question about the ticket price / refunds: ",
  },
  {
    label: "Group booking",
    prompt: "We're a group of  — can we book together?",
  },
  { label: "Venue & parking", prompt: "Is there parking at the venue, and " },
  { label: "Something else", prompt: "" },
];

function normalizePhone(phone: string): string {
  return phone.replace(/[^0-9+]/g, "");
}

interface EventEnquiryButtonProps {
  eventId: string;
  eventTitle: string;
  /** Organizer's FAQs — shown first so people can self-serve before asking. */
  faqs?: EventFaq[];
  /** Text-only button with an icon, no border. */
  plain?: boolean;
}

export function EventEnquiryButton({
  eventId,
  eventTitle,
  faqs = [],
  plain = false,
}: EventEnquiryButtonProps) {
  const answered = faqs.filter((f) => f.question.trim() && f.answer.trim());
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [topic, setTopic] = useState<string>();
  const [messageError, setMessageError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [image, setImage] = useState<{ url: string; name: string } | null>(
    null,
  );
  const [imageError, setImageError] = useState<string | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // let the same file be picked again after removing
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setImageError("Pick an image file (JPG, PNG, WebP or HEIC).");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setImageError("That image is over 5 MB — try a smaller one.");
      return;
    }
    setImageError(null);
    setImageBusy(true);
    shrinkToDataUrl(file, 1200)
      .then((url) => setImage({ url, name: file.name }))
      .catch(() => setImageError("We couldn't read that image."))
      .finally(() => setImageBusy(false));
  }

  function handleClose() {
    if (submitting) return;
    setOpen(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = email.trim();
    const normalizedPhone = normalizePhone(phone);
    const validEmail = EMAIL_PATTERN.test(normalizedEmail);
    // phone is optional — only for people who'd rather get a call back
    const validPhone = !normalizedPhone || PHONE_PATTERN.test(normalizedPhone);
    const validMessage = message.trim().length >= 5;
    setEmailError(validEmail ? null : "Enter a valid email address");
    setPhoneError(validPhone ? null : "Enter a valid phone number");
    setMessageError(
      validMessage ? null : "Tell the organizer what you'd like to know",
    );
    setSubmitError(null);
    if (!validEmail || !validPhone || !validMessage) return;

    setSubmitting(true);
    void submitEventEnquiry(eventId, {
      email: normalizedEmail,
      phone: normalizedPhone || undefined,
      message: message.trim(),
      topic,
      image: image?.url,
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
      <Button
        variant={plain ? "ghost" : "outline"}
        size="sm"
        className={
          plain
            ? "!text-text-secondary hover:!bg-bg-light hover:!text-text-primary !px-2 font-medium"
            : ""
        }
        onClick={() => setOpen(true)}
      >
        {plain && <Icon icon={MessageCircle} size="sm" />}
        Ask a question
      </Button>
      <Modal open={open} onClose={handleClose} title="Ask the organizer">
        {submitted ? (
          <div className="space-y-4" role="status">
            <p className="text-body text-text-primary">
              Question sent. The organizer of {eventTitle} will reply to{" "}
              <span className="font-semibold">{email.trim()}</span>
              {phone.trim() ? " or call you back" : ""} — usually within a day
              or two.
              {image ? " Your image was attached." : ""}
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
              Not sure yet? Ask the organizer anything about {eventTitle} — they
              reply by email.
            </p>
            {answered.length > 0 && (
              <div className="bg-bg-light space-y-2 rounded-lg p-3">
                <p className="text-small text-text-secondary font-semibold">
                  Quick answers
                </p>
                <FaqAccordion faqs={answered} variant="compact" />
                <p className="text-small text-text-secondary">
                  Didn&apos;t find it? Ask below.
                </p>
              </div>
            )}
            <div className="flex flex-wrap gap-2" aria-label="Common questions">
              {TOPICS.map((t) => (
                <button
                  key={t.label}
                  type="button"
                  aria-pressed={topic === t.label}
                  onClick={() => {
                    setTopic(t.label);
                    if (
                      !message.trim() ||
                      TOPICS.some((x) => x.prompt === message)
                    )
                      setMessage(t.prompt);
                  }}
                  className={`text-small rounded-full border px-3 py-1 font-medium transition-colors ${
                    topic === t.label
                      ? "border-primary bg-primary-light text-primary"
                      : "border-border-light text-text-secondary hover:border-border-hover hover:text-text-primary"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <FormField
              label="Your question"
              htmlFor="event-enquiry-message"
              required
              error={messageError ?? undefined}
            >
              <Textarea
                id="event-enquiry-message"
                rows={3}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="e.g. Can I bring my own backing track?"
                autoFocus
              />
            </FormField>
            <FormField
              label="Image (optional)"
              htmlFor="event-enquiry-image"
              hint="A screenshot or photo helps — e.g. a payment error or your instrument setup."
              error={imageError ?? undefined}
            >
              <input
                ref={fileRef}
                id="event-enquiry-image"
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={handleImage}
              />
              {image ? (
                <div className="border-border-light flex items-center gap-3 rounded-lg border p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element -- local data URL preview */}
                  <img
                    src={image.url}
                    alt="Attached image preview"
                    className="h-14 w-14 shrink-0 rounded-md object-cover"
                  />
                  <span className="text-small text-text-primary min-w-0 flex-1 truncate">
                    {image.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="text-small text-primary font-medium hover:underline"
                  >
                    Change
                  </button>
                  <button
                    type="button"
                    aria-label="Remove image"
                    onClick={() => setImage(null)}
                    className="text-text-secondary hover:bg-bg-light hover:text-text-primary rounded-md p-1"
                  >
                    <Icon icon={X} size="sm" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={imageBusy}
                  className="border-border-light text-text-secondary hover:border-border-hover hover:text-text-primary text-small flex w-full items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-3 font-medium transition-colors disabled:opacity-60"
                >
                  <Icon icon={ImagePlus} size="sm" />
                  {imageBusy ? "Preparing image…" : "Choose image from device"}
                </button>
              )}
            </FormField>
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
                required
              />
            </FormField>
            <FormField
              label="Phone (optional)"
              htmlFor="event-enquiry-phone"
              hint="Only if you'd like a call back."
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
