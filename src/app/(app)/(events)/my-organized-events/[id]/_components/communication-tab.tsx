"use client";

import { useEffect, useState } from "react";
import {
  Award,
  CalendarClock,
  HeartHandshake,
  Link2,
  Mail,
  Send,
} from "lucide-react";
import { Button, Icon, Input, Textarea } from "@/components/atoms";
import {
  ConfirmDialog,
  FormField,
  SectionHeader,
} from "@/components/molecules";
import { Attendee } from "@/lib/attendees";
import { CommunicationLog, type RecipientGroup } from "@/lib/communications";
import {
  listCommunications,
  sendCommunication,
} from "@/lib/api/communications";
import { Event } from "@/lib/event";
import { useOrganizedEvent } from "./event-context";

export interface CommunicationTabProps {
  event: Event;
  attendees: Attendee[];
  selectedIds: Set<string>;
}

// "Paid" is left out until the backend can tell who paid.
type RecipientMode = "all" | "confirmed" | "custom";

const GROUP_OF: Record<RecipientMode, RecipientGroup> = {
  all: "ALL",
  confirmed: "CONFIRMED",
  custom: "CUSTOM",
};

const templates: {
  key: string;
  label: string;
  icon: typeof Mail;
  subject: (event: Event) => string;
  body: (event: Event) => string;
  disabled?: (event: Event) => boolean;
}[] = [
  {
    key: "reminder",
    label: "Reminder",
    icon: CalendarClock,
    subject: (event) => `Reminder: ${event.title} is coming up`,
    body: (event) =>
      `Hi there,\n\nJust a reminder that ${event.title} is happening on ${event.date} at ${event.time}.\n\nSee you there!`,
  },
  {
    key: "link",
    label: "Joining link",
    icon: Link2,
    subject: (event) => `Your joining link for ${event.title}`,
    body: (event) =>
      `Hi there,\n\nYour event is starting soon! Here is where to find it:\n\n${event.location}\n\nSee you there!`,
  },
  {
    key: "cert",
    label: "Certificate ready",
    icon: Award,
    subject: (event) => `Your certificate for ${event.title} is ready`,
    body: (event) =>
      `Hi there,\n\nCongratulations on completing ${event.title}!\n\nYour certificate is ready to download from your My Events page.`,
    disabled: (event) => !event.certificate,
  },
  {
    key: "thanks",
    label: "Thank you",
    icon: HeartHandshake,
    subject: (event) => `Thanks for joining ${event.title}`,
    body: () =>
      `Hi there,\n\nThank you for joining! We hope it was valuable.\n\nWe'd love your feedback — see you at the next one!`,
  },
];

export function CommunicationTab({
  event,
  attendees,
  selectedIds,
}: CommunicationTabProps) {
  const { notify } = useOrganizedEvent();
  // Arriving with people ticked on the Attendees page means "email these".
  const [recipientMode, setRecipientMode] = useState<RecipientMode>(
    selectedIds.size > 0 ? "custom" : "all",
  );
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [logs, setLogs] = useState<CommunicationLog[]>([]);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let live = true;
    void listCommunications(event.id).then((rows) => {
      if (live) setLogs(rows);
    });
    return () => {
      live = false;
    };
  }, [event.id]);

  const recipientCounts: Record<RecipientMode, number> = {
    all: attendees.filter((a) => a.status !== "cancelled").length,
    confirmed: attendees.filter(
      (a) => a.status === "registered" || a.status === "attended",
    ).length,
    custom: selectedIds.size,
  };
  const recipientOptions: {
    mode: RecipientMode;
    label: string;
    hint: string;
  }[] = [
    { mode: "all", label: "Everyone", hint: "All active registrations" },
    { mode: "confirmed", label: "Confirmed", hint: "Registered or attended" },
    {
      mode: "custom",
      label: "Selected",
      hint:
        selectedIds.size === 0
          ? "Tick people on Attendees first"
          : "From the Attendees list",
    },
  ];
  const count = recipientCounts[recipientMode];
  const ready = subject.trim().length > 0 && message.trim().length > 0;

  function applyTemplate(template: (typeof templates)[number]) {
    setSubject(template.subject(event));
    setMessage(template.body(event));
  }

  async function handleSend() {
    setSending(true);
    try {
      const log = await sendCommunication(event.id, {
        subject: subject.trim(),
        message: message.trim(),
        group: GROUP_OF[recipientMode],
        participantIds: [...selectedIds],
      });
      setLogs((prev) => [log, ...prev]);
      // The count below is the server's, not the one shown before sending.
      notify(
        `Email queued for ${log.recipientCount} ${log.recipientCount === 1 ? "person" : "people"}`,
      );
      setSubject("");
      setMessage("");
      setConfirmOpen(false);
    } catch (err) {
      notify(
        err instanceof Error ? err.message : "Couldn't send the email.",
        "error",
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Communication"
        description="Email your attendees — reminders, joining links, certificates."
      />

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <section>
            <h3 className="text-small text-text-secondary mb-2 font-bold tracking-widest uppercase">
              1 · Who gets it
            </h3>
            <div
              role="radiogroup"
              aria-label="Recipients"
              className="grid grid-cols-2 gap-3 sm:grid-cols-4"
            >
              {recipientOptions.map((option) => {
                const disabled =
                  option.mode === "custom" && selectedIds.size === 0;
                const active = recipientMode === option.mode;
                return (
                  <button
                    key={option.mode}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    disabled={disabled}
                    onClick={() => setRecipientMode(option.mode)}
                    className={`focus-visible:ring-primary rounded-md border px-3 py-3 text-left transition-colors hover:cursor-pointer focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${
                      active
                        ? "border-primary bg-primary-light"
                        : "border-border-light bg-surface-light hover:border-border-hover"
                    }`}
                  >
                    <span
                      className={`text-heading block leading-none font-extrabold tabular-nums ${active ? "text-primary" : "text-text-primary"}`}
                    >
                      {recipientCounts[option.mode]}
                    </span>
                    <span className="text-small text-text-primary mt-1 block font-semibold">
                      {option.label}
                    </span>
                    <span className="text-small text-text-secondary block">
                      {option.hint}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-small text-text-secondary font-bold tracking-widest uppercase">
                2 · Write it
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {templates.map((template) => (
                  <button
                    key={template.key}
                    type="button"
                    disabled={template.disabled?.(event)}
                    onClick={() => applyTemplate(template)}
                    className="text-small border-border-light bg-surface-light text-text-secondary hover:border-border-hover hover:text-text-primary focus-visible:ring-primary inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-medium transition-colors hover:cursor-pointer focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Icon icon={template.icon} size="sm" className="size-3.5" />
                    {template.label}
                  </button>
                ))}
              </div>
            </div>

            <FormField label="Subject" htmlFor="email-subject" required>
              <Input
                id="email-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="What's this about?"
              />
            </FormField>
            <FormField label="Message" htmlFor="email-body" required>
              <Textarea
                id="email-body"
                rows={8}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Write your message — or start from a template above."
              />
            </FormField>

            <div className="flex items-center justify-between gap-3">
              <p className="text-small text-text-secondary">
                {count === 0
                  ? "No recipients in this group."
                  : `Goes to ${count} ${count === 1 ? "person" : "people"}.`}
              </p>
              <Button
                variant="primary"
                disabled={!ready || count === 0}
                onClick={() => setConfirmOpen(true)}
              >
                <Icon icon={Send} size="sm" /> Review & send
              </Button>
            </div>
          </section>
        </div>

        <aside className="lg:col-span-2">
          <div className="lg:sticky lg:top-4">
            <h3 className="text-small text-text-secondary mb-2 font-bold tracking-widest uppercase">
              Preview
            </h3>
            <div className="border-border-light bg-surface-light overflow-hidden rounded-md border shadow-sm">
              <div className="border-border-light bg-bg-subtle border-b px-4 py-3">
                <p className="text-small text-text-secondary">Subject</p>
                <p className="text-body text-text-primary font-semibold">
                  {subject || (
                    <span className="text-text-secondary/60 font-normal">
                      Your subject line
                    </span>
                  )}
                </p>
              </div>
              <p className="text-body text-text-secondary min-h-40 px-4 py-4 whitespace-pre-line">
                {message || "Your message will appear here as you type."}
              </p>
            </div>
          </div>
        </aside>
      </div>

      <section>
        <h3 className="text-small text-text-secondary mb-3 font-bold tracking-widest uppercase">
          Sent emails
        </h3>
        {logs.length === 0 ? (
          <p className="text-small text-text-secondary">
            Nothing sent yet. Emails you send show up here.
          </p>
        ) : (
          <ul className="border-border-light bg-surface-light divide-border-light divide-y rounded-md border">
            {logs.map((log) => (
              <li
                key={log.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-body text-text-primary truncate font-semibold">
                    {log.subject}
                  </p>
                  <p className="text-small text-text-secondary">
                    {new Date(log.sentAt).toLocaleString("en-IN", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </p>
                </div>
                <span className="text-small text-text-secondary">
                  {log.recipientCount} recipients
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ConfirmDialog
        open={confirmOpen}
        title={`Send to ${count} ${count === 1 ? "person" : "people"}?`}
        confirmLabel="Send now"
        cancelLabel="Keep editing"
        tone="primary"
        busy={sending}
        onConfirm={handleSend}
        onClose={() => setConfirmOpen(false)}
      >
        <p className="text-body font-semibold">{subject}</p>
        <p className="text-small text-text-secondary mt-2 line-clamp-4 whitespace-pre-line">
          {message}
        </p>
      </ConfirmDialog>
    </div>
  );
}
