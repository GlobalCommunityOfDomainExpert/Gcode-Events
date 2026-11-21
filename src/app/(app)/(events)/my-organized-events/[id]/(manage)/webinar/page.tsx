"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Cast,
  Captions,
  Check,
  CircleAlert,
  Clock,
  Copy,
  ExternalLink,
  Eye,
  KeyRound,
  Lock,
  Mail,
  Megaphone,
  MessageSquare,
  Mic,
  MonitorPlay,
  PhoneOff,
  Radio,
  UserPlus,
  Video,
  Hand,
  type LucideIcon,
} from "lucide-react";
import { Badge, Button, Icon, Input, Switch } from "@/components/atoms";
import { FormField } from "@/components/molecules";
import { useServerNow } from "@/hooks/use-server-now";
import {
  getWebinar,
  hostAction,
  saveWebinar,
  type HostAction,
} from "@/lib/api/webinar";
import {
  LIVE_ROOM_ENABLED,
  ORGANIZER_PORTAL_ENABLED,
} from "@/lib/feature-flags";
import {
  CLOSES_AFTER_MIN,
  DEFAULT_WEBINAR,
  OPENS_BEFORE_MIN,
  ROLE_LABEL,
  initials,
  webinarPhase,
  type Speaker,
  type WebinarCapabilities,
  type WebinarConfig,
  type WebinarPhase,
  type WebinarSettings,
} from "@/lib/webinar";
import { useOrganizedEvent } from "../../_components/event-context";

// Organizer's live room (see lib/webinar.ts for the provider-neutral contract).
// Organised by *when* things can be done:
//
//   Set up  — format, auto-record, chat, raise hand, speakers. Room-shaping
//             settings are fixed once doors open.
//   Doors / — the server hands out per-person credentials by time window.
//   Live      Go live, recording, end, notice: each is a server call that runs
//             against the provider; this page never talks to a provider.
//   After   — recording and replay publishing, slides link, follow-up.
//
// The phase follows the server clock plus the server's own live/ended flags.
// Nothing on this page is invented: stat cards, attendance and session notes
// are left out until the provider's webhooks feed them.

const card =
  "border-border-light bg-surface-light rounded-lg border p-6 shadow-sm";

function at(iso: string | null | undefined, offsetMin = 0) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(new Date(iso).getTime() + offsetMin * 60_000));
}

// Room settings that are fixed once doors open (they shape the room).
type RoomKey = "audience" | "recording" | "chat" | "handRaise";
const ROOM_KEYS: RoomKey[] = ["audience", "recording", "chat", "handRaise"];

export default function WebinarPage() {
  const { event, notify } = useOrganizedEvent();
  const now = useServerNow();
  const [settings, setSettings] = useState<WebinarSettings>();
  const [draft, setDraft] = useState<Pick<WebinarConfig, RoomKey>>(() =>
    pickRoom(DEFAULT_WEBINAR.config),
  );

  const load = useCallback(async () => {
    const { settings: s } = await getWebinar(event.id);
    setSettings(s);
    return s;
  }, [event.id]);

  useEffect(() => {
    let live = true;
    void getWebinar(event.id).then(({ settings: s }) => {
      if (!live) return;
      setSettings(s);
      setDraft(pickRoom(s.config));
    });
    return () => {
      live = false;
    };
  }, [event.id]);

  // While doors are open or live, the provider's webhooks move things on
  // (recording ready, stream stopped): pick those up without a reload.
  const active = settings && !settings.status.ended;
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => void load(), 15_000);
    return () => clearInterval(id);
  }, [active, load]);

  if (!LIVE_ROOM_ENABLED || event.mode === "In-Person") {
    return (
      <div className={card}>
        <p className="text-text-primary font-semibold">
          {event.mode === "In-Person"
            ? "No live room for in-person events"
            : "The live room isn't available yet"}
        </p>
        <p className="text-small text-text-secondary mt-1">
          {event.mode === "In-Person"
            ? "Switch the event to Online or Hybrid in Edit details to get a live room."
            : "It is switched off for now."}
        </p>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className={card}>
        <p className="text-small text-text-secondary">Loading the live room…</p>
      </div>
    );
  }

  const { config, status, capabilities, roomLimit, speakers } = settings;
  const dirty = ROOM_KEYS.some((k) => draft[k] !== config[k]);
  const startIso = event.startDateIso;
  const endIso = event.endDateIso;
  const phase = webinarPhase(startIso, endIso, status, now);
  const base = `/my-organized-events/${event.id}`;
  const door = `/events/${event.id}/live`;

  async function persist(patch: Partial<WebinarConfig>, message?: string) {
    try {
      await saveWebinar(event.id, patch);
      await load();
      if (message) notify(message);
    } catch (err) {
      notify(
        err instanceof Error ? err.message : "Couldn't save that.",
        "error",
      );
    }
  }

  async function act(
    action: HostAction,
    body: Record<string, unknown>,
    message: string,
  ) {
    try {
      await hostAction(event.id, action, body);
      await load();
      notify(message);
    } catch (err) {
      notify(
        err instanceof Error ? err.message : "That didn't go through.",
        "error",
      );
    }
  }

  // One line of timing for the header; blank when no start time is set.
  const schedule = startIso
    ? `Doors ${at(startIso, -OPENS_BEFORE_MIN.attendee)} · ${at(startIso)}${endIso ? ` – ${at(endIso)}` : ""}`
    : "";

  return (
    <div className="space-y-6">
      {/* --------------------------------------------------- header + phase */}
      <section className={card}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <span className="bg-primary flex size-11 shrink-0 items-center justify-center rounded-lg text-white">
              <Icon icon={MonitorPlay} size="md" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-text-primary text-lg font-bold">
                  Live room
                </h2>
                <PhaseBadge phase={phase} />
              </div>
              <p className="text-small text-text-secondary mt-1">
                {config.audience === "livestream" ? "Webinar" : "Interactive"}{" "}
                room · attendees join from the event page with their ticket, no
                meeting link to share.
              </p>
              {schedule ? (
                <p className="text-small text-text-primary mt-1 flex items-center gap-1.5 font-medium">
                  <Icon icon={Clock} size="sm" className="size-4" />
                  {schedule}
                </p>
              ) : (
                <Link
                  href={`${base}/edit`}
                  className="text-small text-warning mt-1 inline-flex items-center gap-1.5 font-semibold hover:underline"
                >
                  <Icon icon={Clock} size="sm" className="size-4" />
                  No start time yet — set it in Edit details
                </Link>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                void navigator.clipboard?.writeText(
                  `${window.location.origin}${door}`,
                );
                notify(
                  "Attendee link copied — it only works for ticket holders",
                );
              }}
            >
              <Icon icon={Copy} size="sm" className="size-4" /> Copy attendee
              link
            </Button>
            <Link
              href={door}
              target="_blank"
              className="bg-primary hover:bg-primary-hover text-small inline-flex h-9 items-center gap-2 rounded-sm px-3 font-semibold text-white shadow-sm"
            >
              <Icon
                icon={phase === "after" ? Eye : Video}
                size="sm"
                className="size-4"
              />
              {phase === "after"
                ? "Open replay page"
                : phase === "setup"
                  ? "Test the room"
                  : phase === "doors"
                    ? "Go backstage"
                    : "Open host room"}
              <Icon icon={ExternalLink} size="sm" className="size-3.5" />
            </Link>
          </div>
        </div>
      </section>

      {phase === "setup" && (
        <SetupPhase
          config={config}
          speakers={speakers}
          capabilities={capabilities}
          roomLimit={roomLimit}
          draft={draft}
          setDraft={setDraft}
          dirty={dirty}
          locked={false}
          onSaveRoom={() => void persist(draft, "Room settings saved")}
          onDiscard={() => setDraft(pickRoom(config))}
          onPersist={(patch, message) => void persist(patch, message)}
          startIso={startIso}
          endIso={endIso}
          expected={event.capacity ?? 0}
          editHref={`${base}/edit`}
          speakersHref={`${base}/panelists?invite=1`}
        />
      )}
      {(phase === "doors" || phase === "live") && (
        <LivePhase
          phase={phase}
          config={config}
          status={status}
          capabilities={capabilities}
          speakers={speakers}
          roomLimit={roomLimit}
          startIso={startIso}
          onAct={act}
        />
      )}
      {phase === "after" && (
        <AfterPhase
          config={config}
          recordingReady={status.recordingReady}
          base={base}
          onPersist={(patch, message) => void persist(patch, message)}
        />
      )}
    </div>
  );
}

function pickRoom(c: WebinarConfig): Pick<WebinarConfig, RoomKey> {
  return {
    audience: c.audience,
    recording: c.recording,
    chat: c.chat,
    handRaise: c.handRaise,
  };
}

function PhaseBadge({ phase }: { phase: WebinarPhase }) {
  const map: Record<
    WebinarPhase,
    [string, "success" | "warning" | "danger" | "neutral"]
  > = {
    setup: ["Scheduled", "success"],
    doors: ["Doors open", "warning"],
    live: ["Live now", "danger"],
    after: ["Ended", "neutral"],
  };
  const [label, tone] = map[phase];
  return (
    <Badge variant="muted" tone={tone} size="sm">
      {label}
    </Badge>
  );
}

/* ================================================================ SET UP */

function SetupPhase({
  config,
  speakers,
  capabilities,
  roomLimit,
  draft,
  setDraft,
  dirty,
  locked,
  onSaveRoom,
  onDiscard,
  onPersist,
  startIso,
  endIso,
  expected,
  editHref,
  speakersHref,
}: {
  config: WebinarConfig;
  speakers: Speaker[];
  capabilities: WebinarCapabilities;
  roomLimit: { interactive: number; webinarViewers: number };
  draft: Pick<WebinarConfig, RoomKey>;
  setDraft: React.Dispatch<React.SetStateAction<Pick<WebinarConfig, RoomKey>>>;
  dirty: boolean;
  locked: boolean;
  onSaveRoom: () => void;
  onDiscard: () => void;
  onPersist: (patch: Partial<WebinarConfig>, message?: string) => void;
  startIso: string | null | undefined;
  endIso: string | null | undefined;
  speakersHref: string;
  /** Ticket capacity — what the room has to hold at once. */
  expected: number;
  editHref: string;
}) {
  const [restream, setRestream] = useState(config.restreamUrl ?? "");
  const set = <K extends RoomKey>(k: K, v: WebinarConfig[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));
  const hosts = speakers.filter((s) => s.role === "host").length;
  const pending = speakers.filter((s) => s.inviteStatus === "pending").length;
  const limit =
    draft.audience === "interactive"
      ? roomLimit.interactive
      : roomLimit.webinarViewers;
  const ready = [
    {
      label: "Room created",
      ok: true,
      hint: "Created by the server when the session is set up",
    },
    {
      label: "A host is assigned",
      ok: hosts > 0,
      hint: hosts ? "" : "Someone has to go live and moderate.",
    },
    {
      label: "All speakers accepted",
      ok: pending === 0,
      hint: pending ? `${pending} invite${pending > 1 ? "s" : ""} pending` : "",
    },
    {
      label: "Room settings saved",
      ok: !dirty,
      hint: dirty ? "Unsaved changes below" : "",
    },
    {
      label: "Everyone fits",
      ok: !expected || expected <= limit,
      hint: !expected
        ? `Room holds ${limit} at once`
        : expected <= limit
          ? `${expected} tickets · room holds ${limit}`
          : draft.audience === "interactive" &&
              expected <= roomLimit.webinarViewers
            ? `${expected} tickets, room holds ${limit}. Switch to Webinar (${roomLimit.webinarViewers}).`
            : `${expected} tickets, room holds ${limit}. Lower the ticket limit.`,
    },
  ];
  const before = (min: number) =>
    startIso ? at(startIso, -min) : `${min} min before`;
  const timeline: [string, string, string][] = [
    [
      "Host",
      before(OPENS_BEFORE_MIN.host),
      "Personal pass on the live room page",
    ],
    [
      "Speakers",
      before(OPENS_BEFORE_MIN.speaker),
      "Personal pass on the live room page",
    ],
    [
      "Attendees",
      before(OPENS_BEFORE_MIN.attendee),
      "Join button on the event page, ticket checked",
    ],
    ["Starts", startIso ? at(startIso) : "Start time", "Go live when ready"],
    [
      "Room closes",
      endIso ? at(endIso, CLOSES_AFTER_MIN) : `${CLOSES_AFTER_MIN} min after`,
      `${CLOSES_AFTER_MIN} min after the end`,
    ],
  ];

  const done = ready.filter((r) => r.ok).length;

  return (
    // Main column = what you change (room, people). Side column = whether
    // you're ready and when each group gets in — read, not edited.
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0 space-y-6">
        <section className={card}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-text-primary font-bold">Room settings</h3>
              <p className="text-small text-text-secondary">
                {locked
                  ? "Locked — doors are open. The room was built from these."
                  : "Fixed when doors open — the room is built from these."}
              </p>
            </div>
            {locked && (
              <Icon
                icon={Lock}
                size="sm"
                className="text-text-secondary mt-1"
              />
            )}
          </div>

          <fieldset disabled={locked} className="mt-5 space-y-5">
            <div>
              <p className="text-small text-text-primary font-semibold">
                Format
              </p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {(
                  [
                    [
                      "interactive",
                      "Interactive",
                      `Everyone in the call, in real time · up to ${roomLimit.interactive} people`,
                    ],
                    [
                      "livestream",
                      "Webinar",
                      `Speakers on stage. Attendees watch a few seconds behind, chat and raise a hand — no mic or camera unless you bring them on stage · up to ${roomLimit.webinarViewers} viewers`,
                    ],
                  ] as const
                ).map(([id, label, hint]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => set("audience", id)}
                    className={`rounded-md border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${draft.audience === id ? "border-primary ring-primary/15 bg-[color-mix(in_srgb,var(--color-primary)_5%,transparent)] ring-2" : "border-border-light hover:border-border-hover"}`}
                  >
                    <span className="text-small text-text-primary block font-semibold">
                      {label}
                    </span>
                    <span className="text-text-secondary mt-0.5 block text-xs">
                      {hint}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <SettingRow
              label="Record automatically"
              hint="Starts when you go live. You can also start or stop it during the session."
              checked={draft.recording}
              onChange={(v) => set("recording", v)}
            />

            <div>
              <p className="text-small text-text-primary font-semibold">
                In the room
              </p>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <Switch
                  label="Chat"
                  checked={draft.chat}
                  onChange={(e) => set("chat", e.target.checked)}
                />
                <Switch
                  label="Raise hand"
                  checked={draft.handRaise}
                  onChange={(e) => set("handRaise", e.target.checked)}
                />
              </div>
              <p className="text-text-secondary mt-2 text-xs">
                Live captions can be turned on during the session. Polls and a
                Q&amp;A board aren&apos;t in the room yet — questions come in
                through chat.
              </p>
            </div>
          </fieldset>

          {!locked && (
            <div className="border-border-light mt-5 flex items-center justify-end gap-2 border-t pt-4">
              {dirty && (
                <Button variant="ghost" size="sm" onClick={onDiscard}>
                  Discard
                </Button>
              )}
              <Button
                variant="primary"
                size="sm"
                disabled={!dirty}
                onClick={onSaveRoom}
              >
                Save room settings
              </Button>
            </div>
          )}

          {capabilities.restream && (
            <div className="border-border-light mt-5 border-t pt-4">
              <FormField
                label="Also stream to YouTube (optional)"
                htmlFor="restream-url"
                hint="Paste the stream URL with key from YouTube Studio. Starts and stops with your stream."
              >
                <div className="flex gap-2">
                  <Input
                    id="restream-url"
                    value={restream}
                    onChange={(e) => setRestream(e.target.value)}
                    placeholder="rtmp://a.rtmp.youtube.com/live2/…"
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={restream.trim() === (config.restreamUrl ?? "")}
                    onClick={() =>
                      onPersist(
                        { restreamUrl: restream.trim() || undefined },
                        restream.trim()
                          ? "YouTube stream saved"
                          : "YouTube stream removed",
                      )
                    }
                  >
                    Save
                  </Button>
                </div>
              </FormField>
            </div>
          )}
        </section>

        <SpeakersCard
          speakers={speakers}
          startIso={startIso}
          href={speakersHref}
        />
      </div>

      <aside className="space-y-6 lg:sticky lg:top-6">
        <section className={card}>
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-text-primary font-bold">Ready for the day?</h3>
            <span
              className={`text-xs font-bold ${done === ready.length ? "text-success" : "text-text-secondary"}`}
            >
              {done} of {ready.length}
            </span>
          </div>
          <div className="bg-bg-light mt-3 h-1.5 overflow-hidden rounded-full">
            <div
              className={`h-full rounded-full ${done === ready.length ? "bg-success" : "bg-primary"}`}
              style={{ width: `${(done / ready.length) * 100}%` }}
            />
          </div>
          <ul className="mt-4 space-y-3">
            {ready.map((r) => (
              <li key={r.label} className="flex items-start gap-2.5">
                <span
                  className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full ${r.ok ? "bg-success text-white" : "bg-warning text-text-primary"}`}
                >
                  <Icon
                    icon={r.ok ? Check : CircleAlert}
                    size="sm"
                    className="size-3.5"
                  />
                </span>
                <span className="min-w-0">
                  <span className="text-small text-text-primary block font-semibold">
                    {r.label}
                  </span>
                  {r.hint && (
                    <span
                      className={`block text-xs ${r.ok ? "text-text-secondary" : "text-warning font-medium"}`}
                    >
                      {r.hint}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-text-secondary border-border-light mt-4 border-t pt-3 text-xs">
            Tip: do a 10-minute test run with your speakers a day before — use{" "}
            <strong>Test the room</strong> above.
          </p>
        </section>

        {/* who gets in, and when — a timeline down to the room closing */}
        <section className={card}>
          <h3 className="text-text-primary flex items-center gap-2 font-bold">
            <Icon icon={KeyRound} size="sm" className="text-secondary" /> Who
            gets in, and when
          </h3>
          <p className="text-small text-text-secondary mt-1">
            Everyone has their own pass, so a forwarded link gets nobody in.
          </p>
          {!startIso && (
            <p className="bg-warning-light text-small text-text-primary mt-3 rounded-md px-3 py-2">
              No start time yet —{" "}
              <Link
                href={editHref}
                className="text-primary font-semibold hover:underline"
              >
                set it in Edit details
              </Link>
              . Times below are relative to the start.
            </p>
          )}
          <ol className="mt-4">
            {timeline.map(([who, time, how], i) => (
              <li
                key={who}
                className="grid grid-cols-[1rem_minmax(0,1fr)] gap-x-3"
              >
                <span className="flex flex-col items-center">
                  <span
                    className={`mt-1.5 size-2.5 shrink-0 rounded-full ${who === "Starts" ? "bg-secondary ring-secondary-light ring-4" : "bg-border-hover"}`}
                  />
                  {i < timeline.length - 1 && (
                    <span className="bg-border-light mt-1 w-px flex-1" />
                  )}
                </span>
                <div className="pb-4">
                  <p className="flex items-baseline justify-between gap-2">
                    <span className="text-small text-text-primary font-semibold">
                      {who}
                    </span>
                    <span className="text-small text-text-primary font-bold tabular-nums">
                      {time}
                    </span>
                  </p>
                  <p className="text-text-secondary text-xs">{how}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </aside>
    </div>
  );
}

function SettingRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-small text-text-primary font-semibold">{label}</p>
        <p className="text-text-secondary text-xs">{hint}</p>
      </div>
      <Switch
        aria-label={label}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </div>
  );
}

/* ================================================================ SPEAKERS */

// Speakers are the event's panelist invites with the Speaker role (plus the
// organizer as host), so inviting happens in one place and this card only
// reads them.
function SpeakersCard({
  speakers,
  startIso,
  href,
}: {
  speakers: Speaker[];
  startIso: string | null | undefined;
  href: string;
}) {
  return (
    <section className={card}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-text-primary font-bold">Speakers &amp; host</h3>
          <p className="text-small text-text-secondary">
            On stage with camera and mic. Everyone else joins as an attendee.
          </p>
        </div>
        <Link
          href={href}
          className="border-border-light text-text-primary hover:bg-bg-light text-small inline-flex h-9 items-center gap-1.5 rounded-sm border px-3 font-semibold transition-colors"
        >
          <Icon icon={UserPlus} size="sm" className="size-4" /> Invite
        </Link>
      </div>

      {speakers.length === 0 ? (
        <p className="text-small text-text-secondary mt-4">
          No speakers yet. Invite them as panelists with the Speaker role.
        </p>
      ) : (
        <ul className="divide-border-light mt-4 divide-y">
          {speakers.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-3">
              <span className="bg-primary-light text-primary flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold">
                {initials(s.name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="text-small text-text-primary block truncate font-semibold">
                  {s.name}
                </span>
                <span className="text-text-secondary block truncate text-xs">
                  {s.title}
                </span>
              </span>
              <Badge tone={s.role === "host" ? "primary" : "neutral"} size="sm">
                {ROLE_LABEL[s.role]}
              </Badge>
              {s.inviteStatus === "pending" ? (
                <Badge tone="warning" size="sm">
                  Invite pending
                </Badge>
              ) : (
                <span className="text-success inline-flex items-center gap-1 text-xs font-semibold">
                  <Icon icon={Check} size="sm" className="size-3.5" /> Accepted
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="text-text-secondary mt-3 text-xs">
        Speakers open the live room page from their ticket or invite. It lets
        them in at {at(startIso, -OPENS_BEFORE_MIN.speaker)}.
      </p>
    </section>
  );
}

/* ========================================================== DOORS / LIVE */

function LivePhase({
  phase,
  config,
  status,
  capabilities,
  speakers,
  roomLimit,
  startIso,
  onAct,
}: {
  phase: "doors" | "live";
  config: WebinarConfig;
  status: WebinarSettings["status"];
  capabilities: WebinarCapabilities;
  speakers: Speaker[];
  roomLimit: { interactive: number; webinarViewers: number };
  startIso: string | null | undefined;
  onAct: (
    action: HostAction,
    body: Record<string, unknown>,
    message: string,
  ) => Promise<void>;
}) {
  const webinar = config.audience === "livestream";
  const streaming = status.live;
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [text, setText] = useState(config.notice ?? "");
  const [busy, setBusy] = useState(false);

  async function run(
    action: HostAction,
    body: Record<string, unknown>,
    message: string,
  ) {
    setBusy(true);
    await onAct(action, body, message);
    setBusy(false);
  }

  const presets =
    phase === "doors"
      ? [
          "Starting 10 minutes late — hang tight",
          "We're having audio trouble, back shortly",
        ]
      : [
          "Slides will be shared after the session",
          "We're having audio trouble, back shortly",
        ];

  const inRoom: [LucideIcon, string, string][] = [
    [Mic, "Mute someone on stage", "Participants → their name → Mute"],
    [
      Hand,
      "Bring someone on stage",
      !config.handRaise
        ? "Raise hand is off for this room"
        : webinar
          ? "Accept a raised hand — they switch from viewer to speaker"
          : "Accept a raised hand",
    ],
    [MessageSquare, "Moderate chat", "Chat panel"],
    [PhoneOff, "Leave or end", "Leave keeps it running · End stops it for all"],
  ];

  return (
    <>
      {/* ----------------------------------------------------- broadcast */}
      <section className={card}>
        <div className="flex flex-wrap items-center gap-2">
          {streaming && (
            <span className="bg-secondary size-2.5 animate-pulse rounded-full" />
          )}
          <h3 className="text-text-primary font-bold">
            {streaming
              ? webinar
                ? "You're live"
                : "Session is live"
              : "Doors are open — not live yet"}
          </h3>
        </div>
        <p className="text-small text-text-secondary mt-1">
          {streaming
            ? webinar
              ? "Attendees are watching the stream, a few seconds behind the stage."
              : "Everyone in the room sees and hears the stage."
            : webinar
              ? "Attendees see a waiting screen until you go live."
              : "Attendees can join and wait. Start when your speakers are ready."}
          {startIso && !streaming ? ` Scheduled for ${at(startIso)}.` : ""}
        </p>

        <div className="border-border-light mt-5 grid gap-3 border-t pt-5 sm:grid-cols-2 lg:grid-cols-4">
          <Control
            icon={Radio}
            label="Session"
            state={streaming ? "Live" : "Not started"}
            on={streaming}
            action={
              streaming
                ? capabilities.pause
                  ? "Pause"
                  : "Stop stream"
                : "Go live"
            }
            primary={!streaming}
            disabled={busy}
            onClick={() =>
              void run(
                streaming ? "stop" : "go-live",
                {},
                streaming
                  ? "Stopped. Attendees see the waiting screen"
                  : `You're live${config.recording ? " · recording started" : ""}`,
              )
            }
          />
          <Control
            icon={Video}
            label="Recording"
            state={status.recording ? "Recording" : "Off"}
            on={status.recording}
            action={status.recording ? "Stop" : "Start"}
            disabled={busy}
            onClick={() =>
              void run(
                "record",
                { on: !status.recording },
                status.recording ? "Recording stopped" : "Recording started",
              )
            }
          />
          {capabilities.captions && (
            <Control
              icon={Captions}
              label="Live captions"
              state={config.captions ? "On" : "Off"}
              on={config.captions}
              action={config.captions ? "Turn off" : "Turn on"}
              disabled={busy}
              onClick={() =>
                void run(
                  "captions",
                  { on: !config.captions },
                  config.captions ? "Captions off" : "Captions on for everyone",
                )
              }
            />
          )}
          {capabilities.restream && (
            <Control
              icon={Cast}
              label="YouTube"
              state={
                !config.restreamUrl
                  ? "Not set up"
                  : streaming
                    ? "Streaming"
                    : "Starts with you"
              }
              on={!!config.restreamUrl && streaming}
              note={
                config.restreamUrl ? undefined : "Add a stream URL in Set up"
              }
            />
          )}
        </div>

        <div className="border-border-light mt-5 flex flex-wrap items-center gap-3 border-t pt-4">
          <span className="text-text-secondary text-xs">
            If the stream or recording fails, the controls above go back to Off.
          </span>
          <span className="ml-auto">
            {confirmEnd ? (
              <span className="flex items-center gap-2">
                <span className="text-small text-text-primary">
                  Remove everyone and end?
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmEnd(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    setConfirmEnd(false);
                    void run("end", {}, "Session ended for everyone");
                  }}
                >
                  End session
                </Button>
              </span>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setConfirmEnd(true)}
              >
                <Icon icon={PhoneOff} size="sm" className="size-4" /> End for
                everyone
              </Button>
            )}
          </span>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* notice */}
        <section className={card}>
          <h3 className="text-text-primary flex items-center gap-2 font-bold">
            <Icon icon={Megaphone} size="sm" className="text-secondary" />{" "}
            Notice to attendees
          </h3>
          <p className="text-small text-text-secondary">
            Shows on the event page and the live room page for people who
            haven&apos;t joined yet.
            {capabilities.notice
              ? " It also appears as a banner inside the room."
              : ""}
          </p>
          {config.notice && (
            <div className="border-warning mt-4 flex items-start justify-between gap-3 rounded-md border-l-4 bg-[color-mix(in_srgb,var(--color-warning)_12%,transparent)] p-3">
              <p className="text-small text-text-primary">
                <span className="font-semibold">Showing now:</span>{" "}
                {config.notice}
              </p>
              <button
                type="button"
                onClick={() => {
                  setText("");
                  void run("notice", { text: "" }, "Notice removed");
                }}
                className="text-small text-primary shrink-0 font-semibold hover:underline"
              >
                Remove
              </button>
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-1.5">
            {presets.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setText(p)}
                className="text-small border-border-light text-text-secondary hover:border-border-hover hover:text-text-primary rounded-full border px-3 py-1"
              >
                {p}
              </button>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <Input
              aria-label="Notice text"
              value={text}
              maxLength={120}
              onChange={(e) => setText(e.target.value)}
              placeholder="Short and clear, e.g. Starting at 6:10 PM"
            />
            <Button
              variant="primary"
              size="sm"
              disabled={busy || !text.trim() || text.trim() === config.notice}
              onClick={() =>
                void run(
                  "notice",
                  { text: text.trim() },
                  "Notice posted on the event page and live room page",
                )
              }
            >
              Post
            </Button>
          </div>
        </section>

        {/* in-room controls — explained, not faked */}
        <section className={card}>
          <h3 className="text-text-primary font-bold">In the host room</h3>
          <p className="text-small text-text-secondary">
            These happen inside the room, where you can see who you&apos;re
            acting on. Removing someone is done there too.
          </p>
          <ul className="mt-4 space-y-2.5">
            {inRoom.map(([icon, label, how]) => (
              <li key={label} className="flex items-start gap-3">
                <span className="bg-bg-light text-text-secondary flex size-7 shrink-0 items-center justify-center rounded-md">
                  <Icon icon={icon} size="sm" className="size-3.5" />
                </span>
                <span>
                  <span className="text-small text-text-primary block font-semibold">
                    {label}
                  </span>
                  <span className="text-text-secondary block text-xs">
                    {how}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className={card}>
        <h3 className="text-text-primary flex items-center gap-2 font-bold">
          <Icon icon={Lock} size="sm" className="text-text-secondary" /> Fixed
          for this session
        </h3>
        <p className="text-small text-text-secondary">
          The room was built from these when doors opened. Changing them would
          mean a new room and everyone dropping out.
        </p>
        <dl className="divide-border-light mt-4 divide-y">
          {(
            [
              ["Format", webinar ? "Webinar" : "Interactive"],
              ["Speakers", `${speakers.length} invited`],
              [
                "Room holds",
                webinar
                  ? `${roomLimit.webinarViewers} viewers`
                  : `${roomLimit.interactive} people`,
              ],
              [
                "In the room",
                [config.chat && "Chat", config.handRaise && "Raise hand"]
                  .filter(Boolean)
                  .join(" · ") || "None",
              ],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 py-2.5">
              <dt className="text-small text-text-secondary">{k}</dt>
              <dd className="text-small text-text-primary font-semibold">
                {v}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  );
}

/* ================================================================= AFTER */

function AfterPhase({
  config,
  recordingReady,
  base,
  onPersist,
}: {
  config: WebinarConfig;
  recordingReady: boolean;
  base: string;
  onPersist: (patch: Partial<WebinarConfig>, message?: string) => void;
}) {
  const [slides, setSlides] = useState(config.slidesUrl ?? "");
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className={card}>
        <h3 className="text-text-primary flex items-center gap-2 font-bold">
          <Icon icon={Video} size="sm" className="text-secondary" /> Recording
          &amp; replay
        </h3>
        {recordingReady ? (
          <div className="border-border-light mt-4 border-t pt-4">
            <Switch
              label="Show replay to registrants"
              checked={config.replayPublished}
              onChange={(e) =>
                onPersist(
                  { replayPublished: e.target.checked },
                  e.target.checked ? "Replay published" : "Replay hidden",
                )
              }
            />
            <p className="text-text-secondary mt-1 text-xs">
              Only ticket holders can play it, on the live room page.
            </p>
          </div>
        ) : (
          <p className="text-small text-text-secondary mt-1">
            {config.recording
              ? "The recording is still being processed, or it wasn't started. It shows up here as soon as it's ready."
              : "This session wasn't recorded: auto-record was off and no one started it."}
          </p>
        )}
        <div className="border-border-light mt-5 border-t pt-4">
          <FormField
            label="Slides or resources link"
            htmlFor="slides-url"
            hint="Shown next to the replay for ticket holders."
          >
            <div className="flex gap-2">
              <Input
                id="slides-url"
                type="url"
                value={slides}
                onChange={(e) => setSlides(e.target.value)}
                placeholder="https://…"
              />
              <Button
                variant="secondary"
                size="sm"
                disabled={slides.trim() === (config.slidesUrl ?? "")}
                onClick={() =>
                  onPersist(
                    { slidesUrl: slides.trim() || undefined },
                    slides.trim() ? "Slides link saved" : "Slides link removed",
                  )
                }
              >
                Save
              </Button>
            </div>
          </FormField>
        </div>
      </section>

      {ORGANIZER_PORTAL_ENABLED && (
        <section className={card}>
          <h3 className="text-text-primary flex items-center gap-2 font-bold">
            <Icon icon={Mail} size="sm" className="text-text-secondary" />{" "}
            Follow up
          </h3>
          <p className="text-small text-text-secondary">
            The best time is within a day, while it&apos;s fresh.
          </p>
          <Link
            href={`${base}/communication`}
            className="border-border-light hover:border-border-hover mt-4 flex items-center gap-3 rounded-md border p-3 transition-colors"
          >
            <span className="min-w-0 flex-1">
              <span className="text-small text-text-primary block font-semibold">
                Thank attendees
              </span>
              <span className="text-text-secondary block text-xs">
                With the replay, slides and a feedback link
              </span>
            </span>
            <Icon
              icon={ExternalLink}
              size="sm"
              className="text-text-secondary size-3.5"
            />
          </Link>
        </section>
      )}
    </div>
  );
}

function Control({
  icon,
  label,
  state,
  on,
  action,
  primary,
  onClick,
  note,
  disabled,
}: {
  icon: LucideIcon;
  label: string;
  state: string;
  on: boolean;
  action?: string;
  primary?: boolean;
  onClick?: () => void;
  note?: string;
  disabled?: boolean;
}) {
  return (
    <div className="border-border-light flex flex-col gap-2 rounded-md border p-3">
      <span className="text-text-secondary flex items-center gap-1.5 text-xs font-semibold">
        <Icon icon={icon} size="sm" className="size-3.5" /> {label}
      </span>
      <span
        className={`text-small flex items-center gap-1.5 font-bold ${on ? "text-secondary" : "text-text-primary"}`}
      >
        {on && <span className="bg-secondary size-2 rounded-full" />}
        {state}
      </span>
      {action && onClick ? (
        <Button
          variant={primary ? "primary" : "secondary"}
          size="sm"
          onClick={onClick}
          disabled={disabled}
          className="mt-auto"
        >
          {action}
        </Button>
      ) : (
        note && <span className="text-text-secondary text-xs">{note}</span>
      )}
    </div>
  );
}
