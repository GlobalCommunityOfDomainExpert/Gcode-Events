"use client";

import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { ButtonLink, Icon } from "@/components/atoms";
import { FocusTile } from "./focus-tile";
import { useSession } from "@/hooks/use-session";
import { useMyTickets } from "@/hooks/use-my-tickets";
import { entryTodoFor, timeLeft, type EntryTodo } from "@/lib/entry-status";
import type { MyTicket } from "@/lib/event";

// Each ticket costs three API calls (four with required questions), so only
// the soonest few upcoming tickets are checked.
const MAX_TICKETS_CHECKED = 5;

function useEntryTodos(tickets: MyTicket[], signedIn: boolean): EntryTodo[] {
  const [todos, setTodos] = useState<EntryTodo[]>([]);
  useEffect(() => {
    if (!signedIn || tickets.length === 0) return;
    let cancelled = false;
    const now = new Date();
    const upcoming = tickets
      .filter((t) => new Date(t.date) >= now)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, MAX_TICKETS_CHECKED);
    // Failures are silent: no banner is better than a broken one.
    void Promise.all(
      upcoming.map((t) => entryTodoFor(t, now).catch(() => null)),
    ).then((rows) => {
      if (cancelled) return;
      setTodos(
        rows
          .filter((r): r is EntryTodo => r !== null)
          .sort((a, b) => a.deadline.getTime() - b.deadline.getTime()),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [tickets, signedIn]);
  return todos;
}

function whatsMissing(t: EntryTodo): string {
  const parts: string[] = [];
  const left = t.required - t.answered;
  if (left > 0) parts.push(`${left} required question${left > 1 ? "s" : ""}`);
  if (t.needsClip) parts.push("your audio clip");
  return parts.join(" and ");
}

/**
 * The ONE thing a signed-in user should do next: an unfinished entry (it has
 * a deadline). Renders nothing for guests or when everything is done, and
 * never blocks the page — it appears once the checks come back.
 */
export function AttentionIsland({ className = "" }: { className?: string }) {
  const session = useSession();
  const { tickets } = useMyTickets();
  const todos = useEntryTodos(tickets, !!session);

  const top = todos[0];
  if (!session || !top) return null;
  const more = todos.length - 1;

  return (
    <div className={className}>
      <FocusTile
        urgent
        eyebrow="Action needed · entry incomplete"
        value={timeLeft(top.deadline)}
        label="left to complete your entry"
        text={`${top.ticket.title} — still needs ${whatsMissing(top)}.${top.needsClip ? " Entries without an audio submission are disqualified." : ""}`}
        actions={
          <>
            <ButtonLink href={top.href} variant="accent">
              Complete entry <Icon icon={ArrowRight} size="sm" />
            </ButtonLink>
            <ButtonLink
              href={`/events/${top.ticket.eventId}/registered?pid=${top.ticket.participantId}&info=complete`}
              variant="secondary"
            >
              View ticket
            </ButtonLink>
          </>
        }
        footer={
          more > 0 && (
            <p className="text-small text-text-secondary">
              +{more} more entr{more > 1 ? "ies" : "y"} waiting on you.
            </p>
          )
        }
      />
    </div>
  );
}
