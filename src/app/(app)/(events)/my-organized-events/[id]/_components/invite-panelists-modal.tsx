"use client";

import { useState } from "react";
import { Mail, X } from "lucide-react";
import { Button, Icon, Textarea } from "@/components/atoms";
import { FormField, Modal } from "@/components/molecules";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type PanelistRole = "Judge" | "Mentor" | "Speaker";

// Invite several panelists at once: paste or type emails (chips), pick what
// they'll do, add a note, and see the invite before it goes.
export function InvitePanelistsModal({
  open,
  onClose,
  eventTitle,
  defaultRole,
  existing,
  onInvite,
}: {
  open: boolean;
  onClose: () => void;
  eventTitle: string;
  defaultRole: PanelistRole;
  /** already-invited emails (lowercase) */
  existing: string[];
  /** sends one invite; throws on failure */
  onInvite: (
    email: string,
    extra: { role: PanelistRole; note: string },
  ) => Promise<void>;
}) {
  const [emails, setEmails] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [role, setRole] = useState<PanelistRole>(defaultRole);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [warning, setWarning] = useState("");

  function reset() {
    setEmails([]);
    setDraft("");
    setNote("");
    setErrors({});
    setWarning("");
  }

  function addFrom(text: string) {
    const parts = text
      .split(/[\s,;]+/)
      .map((p) => p.trim().toLowerCase())
      .filter(Boolean);
    if (!parts.length) return;
    const bad = parts.filter((p) => !EMAIL_RE.test(p));
    const dup = parts.filter((p) => existing.includes(p));
    const good = parts.filter(
      (p) => EMAIL_RE.test(p) && !existing.includes(p) && !emails.includes(p),
    );
    setEmails((e) => [...e, ...good]);
    setDraft(bad.join(" "));
    setWarning(
      bad.length
        ? `“${bad[0]}” isn't a valid email.`
        : dup.length
          ? `${dup[0]} is already invited.`
          : "",
    );
  }

  async function send() {
    const list = draft.trim() ? [...emails] : emails;
    if (draft.trim()) addFrom(draft);
    if (!list.length) return;
    setBusy(true);
    const failed: Record<string, string> = {};
    for (const e of list) {
      try {
        await onInvite(e, { role, note: note.trim() });
      } catch (err) {
        failed[e] = err instanceof Error ? err.message : "Couldn't send";
      }
    }
    setBusy(false);
    if (Object.keys(failed).length) {
      setEmails(Object.keys(failed));
      setErrors(failed);
    } else {
      reset();
      onClose();
    }
  }

  const count = emails.length;

  return (
    <Modal
      open={open}
      onClose={() => (busy ? undefined : (reset(), onClose()))}
      title={`Invite ${role.toLowerCase()}s`}
      size="lg"
      footer={
        <>
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => (reset(), onClose())}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={busy}
            disabled={!count && !draft.trim()}
            onClick={send}
          >
            <Mail className="size-4" />
            {count > 1 ? `Send ${count} invites` : "Send invite"}
          </Button>
        </>
      }
    >
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="space-y-5">
          <FormField
            label="Email addresses"
            htmlFor="invite-emails"
            hint="Paste a list, or press Enter / comma after each one."
          >
            <div className="border-border-light focus-within:border-primary focus-within:ring-primary/10 bg-surface-light flex min-h-11 flex-wrap items-center gap-1.5 rounded-sm border px-2 py-1.5 focus-within:ring-4">
              {emails.map((e) => (
                <span
                  key={e}
                  className={`text-small inline-flex items-center gap-1 rounded-full py-0.5 pr-1 pl-2.5 ${errors[e] ? "bg-danger-light text-danger" : "bg-bg-light text-text-primary"}`}
                  title={errors[e]}
                >
                  {e}
                  <button
                    type="button"
                    aria-label={`Remove ${e}`}
                    onClick={() => setEmails(emails.filter((x) => x !== e))}
                    className="hover:bg-border-light rounded-full p-0.5"
                  >
                    <Icon icon={X} size="sm" className="size-3" />
                  </button>
                </span>
              ))}
              <input
                id="invite-emails"
                autoFocus
                value={draft}
                disabled={busy}
                onChange={(e) => setDraft(e.target.value)}
                onPaste={(e) => {
                  e.preventDefault();
                  addFrom(`${draft} ${e.clipboardData.getData("text")}`);
                }}
                onKeyDown={(e) => {
                  if (
                    ["Enter", ",", " ", "Tab"].includes(e.key) &&
                    draft.trim()
                  ) {
                    e.preventDefault();
                    addFrom(draft);
                  } else if (e.key === "Backspace" && !draft && emails.length) {
                    setEmails(emails.slice(0, -1));
                  }
                }}
                onBlur={() => draft.trim() && addFrom(draft)}
                placeholder={
                  count ? "" : "judge@example.com, mentor@example.com"
                }
                className="text-small min-w-40 flex-1 bg-transparent px-1 py-1 outline-none"
              />
            </div>
          </FormField>
          {(warning || Object.keys(errors).length > 0) && (
            <p role="alert" className="text-small text-danger -mt-3">
              {warning ||
                `${Object.keys(errors).length} invite(s) didn't go through — fix or remove the red ones and retry.`}
            </p>
          )}

          <FormField label="They'll join as" htmlFor="invite-role">
            <div
              id="invite-role"
              role="radiogroup"
              className="grid grid-cols-3 gap-2"
            >
              {(
                [
                  ["Judge", "Scores rounds"],
                  ["Mentor", "Guides participants"],
                  ["Speaker", "Takes the stage"],
                ] as const
              ).map(([r, hint]) => (
                <button
                  key={r}
                  type="button"
                  role="radio"
                  aria-checked={role === r}
                  onClick={() => setRole(r)}
                  className={`rounded-md border p-2.5 text-left transition-colors ${role === r ? "border-primary bg-primary/5 ring-primary/15 ring-2" : "border-border-light hover:border-border-hover"}`}
                >
                  <span className="text-small text-text-primary block font-semibold">
                    {r}
                  </span>
                  <span className="text-text-secondary block text-xs">
                    {hint}
                  </span>
                </button>
              ))}
            </div>
          </FormField>

          <FormField
            label="Personal note"
            htmlFor="invite-note"
            hint="Optional — shown at the top of the invite."
          >
            <Textarea
              id="invite-note"
              rows={3}
              value={note}
              disabled={busy}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Would love to have you on the panel — it's a 2-hour commitment on the evening of the finale."
            />
          </FormField>
        </div>

        {/* preview */}
        <div>
          <p className="text-text-secondary text-xs font-semibold tracking-wider uppercase">
            What they&apos;ll get
          </p>
          <div className="border-border-light bg-bg-subtle mt-2 rounded-md border p-4 text-xs">
            <p className="text-text-secondary">Subject</p>
            <p className="text-text-primary font-semibold">
              You&apos;re invited as a {role.toLowerCase()} — {eventTitle}
            </p>
            <div className="border-border-light my-3 border-t" />
            {note && (
              <p className="text-text-primary mb-2 whitespace-pre-wrap italic">
                “{note}”
              </p>
            )}
            <p className="text-text-secondary">
              You&apos;ve been invited to{" "}
              {role === "Judge"
                ? "judge"
                : role === "Mentor"
                  ? "mentor at"
                  : "speak at"}{" "}
              <span className="text-text-primary font-medium">
                {eventTitle}
              </span>
              . Accept to{" "}
              {role === "Judge"
                ? "get access to scoring"
                : "see the schedule and your session"}
              .
            </p>
            <span className="bg-primary mt-3 inline-block rounded-sm px-3 py-1.5 font-semibold text-white">
              Accept invite
            </span>
          </div>
          <p className="text-text-secondary mt-2 text-xs">
            {count
              ? `${count} recipient${count > 1 ? "s" : ""}`
              : "No recipients yet"}
          </p>
        </div>
      </div>
    </Modal>
  );
}
