"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2,
  Check,
  Handshake,
  Link2,
  Mail,
  Minus,
  MoreHorizontal,
  ScanLine,
  Share2,
  UserCog,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { Badge, Button, Icon, Input, Select } from "@/components/atoms";
import {
  Drawer,
  Dropdown,
  FilterTiles,
  FormField,
  Modal,
  SectionHeader,
} from "@/components/molecules";
import { ApiError } from "@/lib/api/client";
import {
  changeTeamRole,
  createShareLink,
  inviteTeamMember,
  listShareLinks,
  listTeam,
  removeTeamMember,
  revokeShareLink,
  type LinkExpiry,
} from "@/lib/api/team";
import {
  AREA_LABEL,
  ROLE_INFO,
  ROLE_ORDER,
  can,
  partnerUrl,
  type Area,
  type ShareLink,
  type TeamMember,
  type TeamRole,
} from "@/lib/team";
import { useOrganizedEvent } from "../../_components/event-context";

const AREAS: Area[] = [
  "overview",
  "schedule",
  "venue",
  "attendees",
  "contacts",
  "checkIn",
  "money",
  "edit",
];

// Short names for the "what they see" line on each row.
const AREA_SHORT: Record<Area, string> = {
  overview: "Registrations",
  schedule: "Run of show",
  venue: "Headcount",
  attendees: "Guest list",
  contacts: "Contacts",
  checkIn: "Check-in",
  money: "Money",
  edit: "Editing",
};

const ROLE_ICON: Record<TeamRole, LucideIcon> = {
  CO_ORGANIZER: UserCog,
  VENUE_PARTNER: Building2,
  SPONSOR: Handshake,
  CHECK_IN: ScanLine,
  FINANCE: Wallet,
};

// Links never hand out organizer powers — that needs a named invite.
const LINK_ROLES = ROLE_ORDER.filter((r) => r !== "CO_ORGANIZER");

const EXPIRY: { value: LinkExpiry; label: string }[] = [
  { value: "7D", label: "In 7 days" },
  { value: "30D", label: "In 30 days" },
  { value: "EVENT_END", label: "When the event ends" },
  { value: "NEVER", label: "Never" },
];

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Kolkata",
  });

/** One row in the access list — a person or a link. */
type Access =
  | { kind: "member"; id: string; role: TeamRole; m: TeamMember }
  | {
      kind: "link";
      id: string;
      role: TeamRole;
      l: ShareLink;
      expired: boolean;
    };

type Filter = "all" | "people" | "links" | "pending";

/** What the drawer is doing. */
type DrawerState =
  | { mode: "new"; role: TeamRole; via: "invite" | "link" }
  | { mode: "edit"; member: TeamMember };

export default function TeamPage() {
  const { event, notify } = useOrganizedEvent();
  const [team, setTeam] = useState<TeamMember[]>();
  const [links, setLinks] = useState<ShareLink[]>();
  const [filter, setFilter] = useState<Filter>("all");
  const [drawer, setDrawer] = useState<DrawerState | null>(null);
  const [toRemove, setToRemove] = useState<Access | null>(null);
  const [now] = useState(() => Date.now());

  const load = useCallback(
    () => Promise.all([listTeam(event.id), listShareLinks(event.id)]),
    [event.id],
  );
  const refresh = useCallback(async () => {
    const [t, l] = await load();
    setTeam(t);
    setLinks(l);
  }, [load]);

  useEffect(() => {
    let live = true;
    void load().then(([t, l]) => {
      if (!live) return;
      setTeam(t);
      setLinks(l);
    });
    return () => {
      live = false;
    };
  }, [load]);

  const rows: Access[] = useMemo(
    () => [
      ...(team ?? []).map((m): Access => ({
        kind: "member",
        id: m.id,
        role: m.role,
        m,
      })),
      ...(links ?? []).map((l): Access => ({
        kind: "link",
        id: l.id,
        role: l.role,
        l,
        expired: !!l.expiresOn && new Date(l.expiresOn).getTime() < now,
      })),
    ],
    [team, links, now],
  );

  const pending = (r: Access) =>
    r.kind === "member" ? r.m.status === "INVITED" : r.expired;
  const counts = {
    all: rows.length,
    people: rows.filter((r) => r.kind === "member").length,
    links: rows.filter((r) => r.kind === "link").length,
    pending: rows.filter(pending).length,
  };
  const visible = rows.filter((r) =>
    filter === "people"
      ? r.kind === "member"
      : filter === "links"
        ? r.kind === "link"
        : filter === "pending"
          ? pending(r)
          : true,
  );

  async function copy(token: string, what: string) {
    try {
      await navigator.clipboard.writeText(partnerUrl(token));
      notify(`${what} copied`);
    } catch {
      notify("Couldn't copy — open it and copy from the address bar", "error");
    }
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Team & access"
        description="Give the people who help run this event their own view of it — your venue, sponsors, door team, accountant. Each role only sees what it needs."
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={() =>
              setDrawer({ mode: "new", role: "VENUE_PARTNER", via: "invite" })
            }
          >
            <Icon icon={Share2} size="sm" /> Share access
          </Button>
        }
      />

      {/* start from who you're sharing with */}
      <section aria-label="Share with" className="space-y-2">
        <p className="text-text-secondary text-xs font-semibold tracking-wide uppercase">
          Share with
        </p>
        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-5 sm:overflow-visible sm:px-0">
          {ROLE_ORDER.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() =>
                setDrawer({
                  mode: "new",
                  role: r,
                  via: r === "SPONSOR" ? "link" : "invite",
                })
              }
              className="border-border-light bg-surface-light hover:border-primary/40 focus-visible:ring-primary group min-w-40 shrink-0 rounded-md border p-3 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none"
            >
              <span className="bg-primary-light text-primary group-hover:bg-primary grid size-8 place-items-center rounded-md transition-colors group-hover:text-white">
                <Icon icon={ROLE_ICON[r]} size="sm" className="size-4" />
              </span>
              <span className="text-text-primary mt-2 block text-sm font-semibold">
                {ROLE_INFO[r].label}
              </span>
              <span className="text-text-secondary block text-xs">
                Sees {ROLE_INFO[r].areas.length} of {AREAS.length}
              </span>
            </button>
          ))}
        </div>
      </section>

      <FilterTiles
        value={filter}
        onChange={(v) => setFilter(v as Filter)}
        tiles={[
          { value: "all", label: "Have access", count: counts.all },
          { value: "people", label: "People", count: counts.people },
          { value: "links", label: "View-only links", count: counts.links },
          {
            value: "pending",
            label: "Pending or expired",
            count: counts.pending,
            attention: true,
          },
        ]}
      />

      {/* who has access */}
      <div className="border-border-light bg-surface-light overflow-hidden rounded-lg border shadow-sm">
        <div className="text-text-secondary border-border-light bg-bg-subtle hidden grid-cols-[minmax(0,2.2fr)_minmax(0,1.6fr)_minmax(0,1.2fr)_auto] gap-4 border-b px-4 py-2.5 text-xs font-semibold tracking-wide uppercase md:grid">
          <span>Who</span>
          <span>Role & what they see</span>
          <span>Status</span>
          <span className="w-28" />
        </div>

        {filter === "all" && (
          <AccessRow
            icon={<span className="text-[11px] font-bold">You</span>}
            title="You"
            sub="Organizer"
            role={
              <Badge tone="primary" size="sm">
                Owner
              </Badge>
            }
            sees="Everything"
            status={
              <span className="text-small text-text-secondary">
                Owns this event
              </span>
            }
          />
        )}

        {team === undefined && (
          <p className="text-small text-text-secondary border-border-light border-t p-4">
            Loading…
          </p>
        )}

        {visible.map((r) => {
          const isMember = r.kind === "member";
          const title = isMember ? (r.m.name ?? r.m.email) : r.l.label;
          const sub = isMember
            ? r.m.name
              ? r.m.email
              : "Invited by email"
            : "View-only link · no sign-in";
          const sees =
            ROLE_INFO[r.role].areas.length === AREAS.length
              ? "Everything, including editing"
              : ROLE_INFO[r.role].areas.map((a) => AREA_SHORT[a]).join(" · ");
          const status = isMember ? (
            r.m.status === "INVITED" ? (
              <>
                <Badge tone="warning" size="sm">
                  Invite pending
                </Badge>
                <span className="text-text-secondary text-xs">
                  sent {fmt(r.m.invitedOn)}
                </span>
              </>
            ) : (
              <Badge variant="muted" tone="success" size="sm">
                ● Active
              </Badge>
            )
          ) : r.expired ? (
            <>
              <Badge tone="neutral" size="sm">
                Expired
              </Badge>
              <span className="text-text-secondary text-xs">
                {fmt(r.l.expiresOn!)} · {r.l.views} views
              </span>
            </>
          ) : (
            <>
              <Badge variant="muted" tone="success" size="sm">
                ● Live
              </Badge>
              <span className="text-text-secondary text-xs">
                {r.l.expiresOn ? `until ${fmt(r.l.expiresOn)}` : "no expiry"} ·{" "}
                {r.l.views} views
              </span>
            </>
          );

          // A token is shown once, at creation, so existing rows have no
          // link to copy or preview. To reissue, revoke and create again.
          const items = [
            ...(isMember
              ? [
                  {
                    label: "Change role",
                    onSelect: () => setDrawer({ mode: "edit", member: r.m }),
                  },
                  { label: "", divider: true },
                ]
              : []),
            {
              label: isMember ? "Remove access" : "Revoke link",
              onSelect: () => setToRemove(r),
            },
          ];

          return (
            <AccessRow
              key={`${r.kind}-${r.id}`}
              muted={r.kind === "link" && r.expired}
              icon={
                isMember ? (
                  <span className="text-[11px] font-bold">
                    {title.slice(0, 2).toUpperCase()}
                  </span>
                ) : (
                  <Icon icon={Link2} size="sm" className="size-4" />
                )
              }
              title={title}
              sub={sub}
              role={
                <span className="text-text-primary inline-flex items-center gap-1.5 text-sm font-semibold">
                  <Icon
                    icon={ROLE_ICON[r.role]}
                    size="sm"
                    className="text-primary size-4"
                  />
                  {ROLE_INFO[r.role].label}
                </span>
              }
              sees={sees}
              status={status}
              actions={
                <>
                  <Dropdown
                    align="right"
                    trigger={
                      <button
                        type="button"
                        aria-label={`More for ${title}`}
                        className="border-border-light text-text-secondary hover:bg-bg-light hover:text-text-primary grid size-9 place-items-center rounded-sm border transition-colors"
                      >
                        <Icon
                          icon={MoreHorizontal}
                          size="sm"
                          className="size-4"
                        />
                      </button>
                    }
                    items={items}
                  />
                </>
              }
            />
          );
        })}

        {team !== undefined && visible.length === 0 && (
          <p className="text-small text-text-secondary border-border-light border-t p-6 text-center">
            {filter === "pending"
              ? "Nothing pending — every invite's been opened and no links have expired."
              : "No one here yet. Pick a role above to share access."}
          </p>
        )}
      </div>

      {/* reference, folded away */}
      <details className="border-border-light bg-surface-light group rounded-lg border shadow-sm">
        <summary className="text-text-primary flex cursor-pointer list-none items-center justify-between p-4 font-semibold [&::-webkit-details-marker]:hidden">
          Compare roles — who sees what
          <span className="text-primary text-small font-semibold group-open:hidden">
            Show
          </span>
          <span className="text-primary text-small hidden font-semibold group-open:inline">
            Hide
          </span>
        </summary>
        <div className="border-border-light overflow-x-auto border-t">
          <table className="w-full min-w-[42rem] text-left">
            <thead>
              <tr className="border-border-light border-b">
                <th className="p-3" />
                {ROLE_ORDER.map((r) => (
                  <th
                    key={r}
                    className="text-text-primary p-3 text-center text-xs font-bold"
                  >
                    {ROLE_INFO[r].label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {AREAS.map((a) => (
                <tr
                  key={a}
                  className="border-border-light border-b last:border-b-0"
                >
                  <td className="text-small text-text-primary p-3 font-medium">
                    {AREA_LABEL[a]}
                  </td>
                  {ROLE_ORDER.map((r) => (
                    <td key={r} className="p-3 text-center">
                      <Icon
                        icon={can(r, a) ? Check : Minus}
                        size="sm"
                        className={`mx-auto size-4 ${can(r, a) ? "text-success" : "text-border-hover"}`}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <ShareDrawer
        state={drawer}
        eventEnd={event.endDateIso ?? null}
        onClose={() => setDrawer(null)}
        onInvite={async (email, role) => {
          // No mailer yet, and the server keeps only a hash of the token, so
          // this is the one moment the link exists: copy it for the organizer
          // to send.
          const { token } = await inviteTeamMember(event.id, email, role);
          setDrawer(null);
          await refresh();
          await copy(token, `Invite link for ${email}`);
        }}
        onLink={async (label, role, expiry) => {
          const { token } = await createShareLink(event.id, {
            label,
            role,
            expiry,
          });
          setDrawer(null);
          await refresh();
          await copy(token, "New link");
        }}
        onChangeRole={async (member, role) => {
          await changeTeamRole(member.id, role);
          notify(
            `${member.name ?? member.email} is now ${ROLE_INFO[role].label}`,
          );
          setDrawer(null);
          await refresh();
        }}
      />

      <Modal
        open={!!toRemove}
        onClose={() => setToRemove(null)}
        title={
          toRemove?.kind === "link" ? "Revoke this link?" : "Remove access?"
        }
        footer={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setToRemove(null)}
            >
              Keep
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={async () => {
                if (!toRemove) return;
                if (toRemove.kind === "member") {
                  await removeTeamMember(toRemove.id);
                  notify(`${toRemove.m.name ?? toRemove.m.email} removed`);
                } else {
                  await revokeShareLink(toRemove.id);
                  notify("Link revoked — it no longer works");
                }
                setToRemove(null);
                await refresh();
              }}
            >
              {toRemove?.kind === "link" ? "Revoke" : "Remove"}
            </Button>
          </>
        }
      >
        <p className="text-body text-text-secondary">
          {toRemove?.kind === "link"
            ? `Anyone opening "${toRemove.l.label}" will see "This link isn't working".`
            : `${toRemove?.kind === "member" ? (toRemove.m.name ?? toRemove.m.email) : ""} loses access straight away — their link stops working.`}
        </p>
      </Modal>
    </div>
  );
}

function AccessRow({
  icon,
  title,
  sub,
  role,
  sees,
  status,
  actions,
  muted = false,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
  role: React.ReactNode;
  sees: string;
  status: React.ReactNode;
  actions?: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <div
      className={`border-border-light grid items-center gap-x-4 gap-y-2 border-t px-4 py-3 first:border-t-0 md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.6fr)_minmax(0,1.2fr)_auto] ${muted ? "opacity-60" : ""}`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="bg-primary-light text-primary grid size-9 shrink-0 place-items-center rounded-full">
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-text-primary truncate text-sm font-semibold">
            {title}
          </p>
          <p className="text-text-secondary truncate text-xs">{sub}</p>
        </div>
      </div>
      <div className="min-w-0 pl-12 md:pl-0">
        {role}
        <p className="text-text-secondary truncate text-xs">{sees}</p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 pl-12 md:pl-0">
        {status}
      </div>
      <div className="flex w-28 items-center justify-end gap-2 justify-self-end">
        {actions}
      </div>
    </div>
  );
}

function RoleCards({
  roles,
  value,
  onChange,
}: {
  roles: TeamRole[];
  value: TeamRole;
  onChange: (r: TeamRole) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Role"
      className="grid gap-2 sm:grid-cols-2"
    >
      {roles.map((r) => {
        const on = r === value;
        return (
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(r)}
            className={`flex items-center gap-2.5 rounded-md border p-2.5 text-left transition-colors ${
              on
                ? "border-primary bg-primary-light"
                : "border-border-light hover:border-border-hover"
            }`}
          >
            <span
              className={`grid size-8 shrink-0 place-items-center rounded-md ${on ? "bg-primary text-white" : "bg-bg-light text-text-secondary"}`}
            >
              <Icon icon={ROLE_ICON[r]} size="sm" className="size-4" />
            </span>
            <span className="text-text-primary text-sm font-semibold">
              {ROLE_INFO[r].label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** The role's view, spelled out: what's in, what's left out. */
function WhatTheySee({ role }: { role: TeamRole }) {
  return (
    <div className="bg-bg-subtle rounded-md p-4">
      <p className="text-small text-text-secondary">{ROLE_INFO[role].who}</p>
      <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
        {AREAS.map((a) => {
          const yes = can(role, a);
          return (
            <li
              key={a}
              className={`text-small flex items-center gap-2 ${yes ? "text-text-primary font-medium" : "text-text-secondary/70 line-through"}`}
            >
              <Icon
                icon={yes ? Check : X}
                size="sm"
                className={`size-3.5 shrink-0 ${yes ? "text-success" : ""}`}
              />
              {AREA_LABEL[a]}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ShareDrawer({
  state,
  eventEnd,
  onClose,
  onInvite,
  onLink,
  onChangeRole,
}: {
  state: DrawerState | null;
  eventEnd: string | null;
  onClose: () => void;
  onInvite: (email: string, role: TeamRole) => Promise<void>;
  onLink: (label: string, role: TeamRole, expiry: LinkExpiry) => Promise<void>;
  onChangeRole: (m: TeamMember, role: TeamRole) => Promise<void>;
}) {
  // Re-seeded every time the drawer opens for something new.
  const key = state
    ? state.mode === "edit"
      ? `edit-${state.member.id}`
      : `new-${state.role}-${state.via}`
    : "closed";
  return (
    <Drawer
      open={!!state}
      onClose={onClose}
      title={state?.mode === "edit" ? "Change role" : "Share access"}
      subtitle={
        state?.mode === "edit"
          ? (state.member.name ?? state.member.email)
          : "Invite a person, or make a link anyone can open."
      }
    >
      {state && (
        <ShareForm
          key={key}
          state={state}
          eventEnd={eventEnd}
          onInvite={onInvite}
          onLink={onLink}
          onChangeRole={onChangeRole}
        />
      )}
    </Drawer>
  );
}

function ShareForm({
  state,
  eventEnd,
  onInvite,
  onLink,
  onChangeRole,
}: {
  state: DrawerState;
  eventEnd: string | null;
  onInvite: (email: string, role: TeamRole) => Promise<void>;
  onLink: (label: string, role: TeamRole, expiry: LinkExpiry) => Promise<void>;
  onChangeRole: (m: TeamMember, role: TeamRole) => Promise<void>;
}) {
  const editing = state.mode === "edit";
  const [via, setVia] = useState<"invite" | "link">(
    state.mode === "new" ? state.via : "invite",
  );
  const [role, setRole] = useState<TeamRole>(
    state.mode === "edit" ? state.member.role : state.role,
  );
  const [email, setEmail] = useState("");
  const [label, setLabel] = useState("");
  const [expiry, setExpiry] = useState<LinkExpiry>("30D");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const roles = via === "link" && !editing ? LINK_ROLES : ROLE_ORDER;
  const effectiveRole = roles.includes(role) ? role : roles[0];
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  async function submit() {
    setBusy(true);
    setError("");
    try {
      if (state.mode === "edit")
        await onChangeRole(state.member, effectiveRole);
      else if (via === "invite") await onInvite(email.trim(), effectiveRole);
      else await onLink(label, effectiveRole, expiry);
    } catch (err) {
      setError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : "Something went wrong.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {!editing && (
        <div className="bg-bg-light grid grid-cols-2 gap-1 rounded-md p-1">
          {(
            [
              ["invite", Mail, "Invite a person"],
              ["link", Link2, "Create a link"],
            ] as const
          ).map(([v, icon, text]) => (
            <button
              key={v}
              type="button"
              aria-pressed={via === v}
              onClick={() => setVia(v)}
              className={`text-small inline-flex items-center justify-center gap-1.5 rounded-sm py-2 font-semibold transition-colors ${
                via === v
                  ? "bg-surface-light text-text-primary shadow-sm"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              <Icon icon={icon} size="sm" className="size-4" /> {text}
            </button>
          ))}
        </div>
      )}

      {!editing && via === "invite" && (
        <FormField
          label="Their email"
          htmlFor="share-email"
          error={error || undefined}
          hint="You get a personal link to send them. View-only roles need no GCODE account; a co-organizer must sign in."
        >
          <Input
            id="share-email"
            type="email"
            icon={Mail}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="events@yourvenue.com"
          />
        </FormField>
      )}
      {!editing && via === "link" && (
        <div className="grid gap-4 sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <FormField
            label="Name it"
            htmlFor="share-label"
            hint="Only you see this."
          >
            <Input
              id="share-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Title sponsor — weekly numbers"
            />
          </FormField>
          <FormField label="Stops working" htmlFor="share-expiry">
            <Select
              id="share-expiry"
              value={expiry}
              onChange={(e) => setExpiry(e.target.value as LinkExpiry)}
            >
              {EXPIRY.map((e) => (
                <option
                  key={e.value}
                  value={e.value}
                  disabled={e.value === "EVENT_END" && !eventEnd}
                >
                  {e.label}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
      )}

      <div className="space-y-3">
        <p className="text-small text-text-primary font-semibold">
          {editing ? "New role" : "As"}
        </p>
        <RoleCards roles={roles} value={effectiveRole} onChange={setRole} />
        {via === "link" && !editing && (
          <p className="text-text-secondary text-xs">
            Co-organizer needs a named invite — links can&apos;t edit the event.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-small text-text-primary font-semibold">
          They&apos;ll see
        </p>
        <WhatTheySee role={effectiveRole} />
      </div>

      {(editing || via === "link") && error && (
        <p className="text-small text-danger">{error}</p>
      )}

      <div className="border-border-light flex items-center justify-end gap-2 border-t pt-4">
        <Button
          variant="primary"
          size="sm"
          loading={busy}
          disabled={!editing && via === "invite" && !validEmail}
          onClick={() => void submit()}
        >
          {editing ? (
            "Save role"
          ) : via === "invite" ? (
            <>
              <Icon icon={Mail} size="sm" /> Send invite
            </>
          ) : (
            <>
              <Icon icon={Link2} size="sm" /> Create & copy link
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
