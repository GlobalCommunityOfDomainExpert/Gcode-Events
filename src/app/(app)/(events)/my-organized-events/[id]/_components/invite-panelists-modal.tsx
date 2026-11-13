"use client";

import { useState } from "react";
import { Mail, X } from "lucide-react";
import { Button, Icon } from "@/components/atoms";
import { FormField, Modal } from "@/components/molecules";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Invite several panelists at once: paste or type emails (chips). The invite
// API only takes an email, so there is no role or note to collect — those come
// back when the backend supports them.
export function InvitePanelistsModal({
  open,
  onClose,
  noun,
  existing,
  onInvite,
}: {
  open: boolean;
  onClose: () => void;
  /** "judges" when judging applies to the event, otherwise "panelists" */
  noun: "judges" | "panelists";
  /** already-invited emails (lowercase) */
  existing: string[];
  /** sends one invite; throws on failure */
  onInvite: (email: string) => Promise<void>;
}) {
  const [emails, setEmails] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [warning, setWarning] = useState("");

  function reset() {
    setEmails([]);
    setDraft("");
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
        await onInvite(e);
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
      title={`Invite ${noun}`}
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
              placeholder={count ? "" : "name@example.com, other@example.com"}
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
      </div>
    </Modal>
  );
}
