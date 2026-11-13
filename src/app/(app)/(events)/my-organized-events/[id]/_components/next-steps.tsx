"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { Icon } from "@/components/atoms";
import type { Event, UpiClaim } from "@/lib/event";
import { bucketOf, eventTools } from "@/lib/organizer";
import { listEventPanelists } from "@/lib/api/panelists";

interface Step {
  label: string;
  hint: string;
  done: boolean;
  href: string;
  cta: string;
}

// The handful of things that matter next for *this* event — a hackathon's
// list is about rounds and judges, a paid event's about payments; after the
// event it's the wrap-up.
export function NextSteps({
  event,
  claims,
  now,
}: {
  event: Event;
  claims: UpiClaim[];
  now: Date;
}) {
  const base = `/my-organized-events/${event.id}`;
  const tools = eventTools(event);
  const past = bucketOf(event, now) === "past";
  const steps: Step[] = [];
  // judges count once at least one has accepted the invite
  const [judges, setJudges] = useState<{ accepted: number; invited: number }>();
  useEffect(() => {
    if (!tools.judging) return;
    let live = true;
    void listEventPanelists(event.id).then((rows) => {
      if (live)
        setJudges({
          accepted: rows.filter((r) => r.status === "ACCEPTED").length,
          invited: rows.filter((r) => r.status === "INVITED").length,
        });
    });
    return () => {
      live = false;
    };
  }, [event.id, tools.judging]);

  if (past) {
    steps.push({
      label: "Export attendance",
      hint: "Who registered and who showed up.",
      done: false,
      href: `${base}/attendees`,
      cta: "Open attendees",
    });
    if (tools.judging)
      steps.push({
        label: "Announce winners",
        hint: "Share the final leaderboard.",
        done: event.rounds.length > 0,
        href: `${base}/rounds`,
        cta: "Rounds",
      });
  } else {
    steps.push(
      {
        label: "Add a cover image",
        hint: "3:1 banner — it's the first thing people see.",
        done: !!event.coverImageUrl,
        href: `${base}/edit`,
        cta: "Add cover",
      },
      {
        label: "Publish the agenda",
        hint: "Attendees decide faster when they see the run of show.",
        done: event.timeline.length > 0,
        href: `${base}/edit`,
        cta: "Add agenda",
      },
    );
    if (tools.judging) {
      steps.push(
        {
          label: "Set up rounds",
          hint: "Screening → semi final → finale, with scoring criteria.",
          done: event.rounds.length > 0,
          href: `${base}/rounds`,
          cta: "Set up rounds",
        },
        {
          label: "Invite judges",
          hint: judges?.accepted
            ? `${judges.accepted} judge${judges.accepted > 1 ? "s" : ""} on the panel${judges.invited ? ` · ${judges.invited} invite pending` : ""}.`
            : judges?.invited
              ? `${judges.invited} invite${judges.invited > 1 ? "s" : ""} waiting for a reply.`
              : "They'll get scoring access once they accept.",
          done: (judges?.accepted ?? 0) > 0,
          href: `${base}/panelists?invite=1`,
          cta: judges?.accepted ? "Panel" : "Invite judges",
        },
      );
    }
    if (tools.money) {
      const pendingClaims = claims.filter((c) => c.status === "PENDING").length;
      steps.push({
        label: "Verify payments",
        hint: pendingClaims
          ? `${pendingClaims} UPI claim${pendingClaims > 1 ? "s" : ""} waiting.`
          : "No payments waiting.",
        done: pendingClaims === 0,
        href: `${base}/upi-claims`,
        cta: "Review",
      });
    }
    if (tools.checkIn) {
      steps.push({
        label: "Plan check-in",
        hint: "Scan tickets at the door from the attendee list.",
        done: false,
        href: `${base}/attendees`,
        cta: "Attendees",
      });
    }
  }

  const done = steps.filter((s) => s.done).length;
  const todo = steps.filter((s) => !s.done);
  const shown = [...todo, ...steps.filter((s) => s.done)].slice(0, 4);
  const pct = steps.length ? Math.round((done / steps.length) * 100) : 100;

  return (
    <section className="border-border-light bg-surface-light rounded-lg border p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-text-primary font-bold">
            {past
              ? "Wrap up"
              : `Next steps for this ${(event.type ?? "event").toLowerCase()}`}
          </h2>
          <p className="text-small text-text-secondary">
            {todo.length
              ? `${todo.length} to go — ${done} of ${steps.length} done`
              : "All set — nothing waiting on you."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="bg-bg-light h-1.5 w-32 overflow-hidden rounded-full">
            <div
              className="bg-success h-full rounded-full"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-small text-text-secondary tabular-nums">
            {pct}%
          </span>
        </div>
      </div>
      <ul className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2">
        {shown.map((s) => (
          <li
            key={s.label}
            className={`flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 rounded-md border p-3 sm:flex-nowrap ${s.done ? "border-border-light bg-bg-subtle" : "border-border-light"}`}
          >
            <span
              className={`grid size-7 shrink-0 place-items-center rounded-full ${s.done ? "bg-success text-white" : "border-border-hover border-2 border-dashed"}`}
            >
              {s.done && <Icon icon={Check} size="sm" className="size-3.5" />}
            </span>
            <span className="min-w-0 flex-1">
              <span
                className={`text-small block font-semibold ${s.done ? "text-text-secondary line-through" : "text-text-primary"}`}
              >
                {s.label}
              </span>
              <span className="text-text-secondary block truncate text-xs">
                {s.hint}
              </span>
            </span>
            {!s.done && (
              <Link
                href={s.href}
                className="text-primary text-small ml-10 inline-flex shrink-0 items-center gap-1 font-semibold hover:underline sm:ml-0"
              >
                {s.cta}{" "}
                <Icon icon={ArrowRight} size="sm" className="size-3.5" />
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
