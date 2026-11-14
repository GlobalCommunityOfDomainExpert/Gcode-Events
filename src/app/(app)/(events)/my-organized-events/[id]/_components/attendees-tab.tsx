"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Download, Trash2, Users } from "lucide-react";
import {
  Avatar,
  Badge,
  Button,
  Checkbox,
  Icon,
  Select,
} from "@/components/atoms";
import {
  ConfirmDialog,
  Drawer,
  EmptyState,
  FilterTiles,
  Pagination,
  SearchBar,
  SectionHeader,
  TableSkeleton,
} from "@/components/molecules";
import {
  ATTENDEES_CSV_HEADERS,
  Attendee,
  attendeesCsvRows,
  audioSubmissionStatus,
  isUploadedAudioUrl,
} from "@/lib/attendees";
import { downloadCsv, exportFilename } from "@/lib/csv";
import { Event } from "@/lib/event";
import {
  listParticipantTeamMembers,
  listParticipantYoutubeTracks,
  ParticipantTeamMemberApi,
  ParticipantYoutubeTrackApi,
  removeParticipant,
} from "@/lib/api/participants";
import { ApiError } from "@/lib/api/client";
import { useOrganizedEvent } from "./event-context";
import {
  attendanceStatusLabel,
  attendanceStatusTone,
  submissionStatusLabel,
  submissionStatusTone,
  ticketTypeTone,
} from "./status-maps";

const AGE_CATEGORY_LABELS: Record<"YOUNGSTER" | "ADULT" | "SENIOR", string> = {
  YOUNGSTER: "Youngster (below 18)",
  ADULT: "Adult (18–60)",
  SENIOR: "Senior Citizen (60 and above)",
};

export type AttendeesFilterValue =
  "all" | "paid" | "free" | "attended" | "missed" | "submitted" | "pending";
export type AttendeesCategoryFilterValue = "all" | "Attendee" | "Participant";

export interface AttendeesTabProps {
  event: Event;
  attendees: Attendee[];
  /** True until the first attendee fetch resolves — shows a list skeleton. */
  loading?: boolean;
  selectedIds: Set<string>;
  onSelectedIdsChange: (ids: Set<string>) => void;
  // Refetches the attendee list after a remove.
  onAttendeesChanged: () => void;
}

const PAGE_SIZE = 10;

function exportCsv(filename: string, attendees: Attendee[]) {
  downloadCsv(filename, ATTENDEES_CSV_HEADERS, attendeesCsvRows(attendees));
}

function relativeDay(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-border-light flex justify-between gap-4 border-b py-2.5 last:border-b-0">
      <dt className="text-small text-text-secondary">{label}</dt>
      <dd className="text-small text-text-primary text-right font-medium">
        {children}
      </dd>
    </div>
  );
}

export function AttendeesTab({
  event,
  attendees,
  loading = false,
  selectedIds,
  onSelectedIdsChange,
  onAttendeesChanged,
}: AttendeesTabProps) {
  const { notify } = useOrganizedEvent();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<AttendeesFilterValue>("all");
  const [categoryFilter, setCategoryFilter] =
    useState<AttendeesCategoryFilterValue>("all");
  const [page, setPage] = useState(1);
  const [viewing, setViewing] = useState<Attendee | null>(null);
  const [tracks, setTracks] = useState<ParticipantYoutubeTrackApi[]>([]);
  const [members, setMembers] = useState<ParticipantTeamMemberApi[]>([]);
  const [toRemove, setToRemove] = useState<string[] | null>(null);
  const [removing, setRemoving] = useState(false);

  const submissionDeadlineIso =
    event.participantRegistration.registrationDeadlineIso;
  const submissionOf = (a: Attendee) =>
    audioSubmissionStatus(
      a,
      submissionDeadlineIso,
      event.audioRecordingEnabled,
    );

  // Participant-submitted child lists load only when the drawer opens.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!viewing || viewing.category !== "Participant") {
        if (!cancelled) {
          setTracks([]);
          setMembers([]);
        }
        return;
      }
      try {
        const [t, m] = await Promise.all([
          listParticipantYoutubeTracks(viewing.id),
          listParticipantTeamMembers(viewing.id),
        ]);
        if (!cancelled) {
          setTracks(t);
          setMembers(m);
        }
      } catch {
        // best-effort
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [viewing]);

  const counts = useMemo(
    () => ({
      all: attendees.length,
      paid: attendees.filter((a) => a.ticketType === "Paid").length,
      free: attendees.filter((a) => a.ticketType === "Free").length,
      attended: attendees.filter((a) => a.status === "attended").length,
      missed: attendees.filter((a) => a.status === "missed").length,
      submitted: attendees.filter((a) => submissionOf(a) === "submitted")
        .length,
      pending: attendees.filter((a) => submissionOf(a) === "pending").length,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [attendees, submissionDeadlineIso, event.audioRecordingEnabled],
  );

  const passCounts = {
    Attendee: attendees.filter((a) => a.category === "Attendee").length,
    Participant: attendees.filter((a) => a.category === "Participant").length,
  };
  const hasBothPasses = passCounts.Attendee > 0 && passCounts.Participant > 0;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return attendees.filter((a) => {
      if (filter === "paid" && a.ticketType !== "Paid") return false;
      if (filter === "free" && a.ticketType !== "Free") return false;
      if (filter === "attended" && a.status !== "attended") return false;
      if (filter === "missed" && a.status !== "missed") return false;
      if (
        (filter === "submitted" || filter === "pending") &&
        submissionOf(a) !== filter
      )
        return false;
      if (categoryFilter !== "all" && a.category !== categoryFilter)
        return false;
      return !q || `${a.name} ${a.email}`.toLowerCase().includes(q);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    attendees,
    filter,
    categoryFilter,
    query,
    submissionDeadlineIso,
    event.audioRecordingEnabled,
  ]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  const allOnPageSelected =
    pageRows.length > 0 && pageRows.every((r) => selectedIds.has(r.id));

  function toggleRow(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedIdsChange(next);
  }

  function togglePage(checked: boolean) {
    const next = new Set(selectedIds);
    pageRows.forEach((r) => (checked ? next.add(r.id) : next.delete(r.id)));
    onSelectedIdsChange(next);
  }

  async function confirmRemove() {
    if (!toRemove) return;
    setRemoving(true);
    try {
      await Promise.all(toRemove.map((id) => removeParticipant(id)));
      const next = new Set(selectedIds);
      toRemove.forEach((id) => next.delete(id));
      onSelectedIdsChange(next);
      setViewing(null);
      notify(
        toRemove.length === 1
          ? "Registration cancelled"
          : `${toRemove.length} registrations cancelled`,
      );
      setToRemove(null);
      onAttendeesChanged();
    } catch (err) {
      notify(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : "Couldn't remove one or more attendees.",
        "error",
      );
    } finally {
      setRemoving(false);
    }
  }

  const removeLabel =
    toRemove?.length === 1
      ? (attendees.find((a) => a.id === toRemove[0])?.name ?? "this attendee")
      : `${toRemove?.length ?? 0} attendees`;

  const tiles = [
    { value: "all", label: "Everyone", count: counts.all },
    { value: "attended", label: "Attended", count: counts.attended },
    { value: "missed", label: "Missed", count: counts.missed },
    { value: "paid", label: "Paid", count: counts.paid },
    { value: "free", label: "Free", count: counts.free },
    ...(event.audioRecordingEnabled
      ? [
          {
            value: "pending",
            label: "Awaiting submission",
            count: counts.pending,
            attention: true,
          },
          { value: "submitted", label: "Submitted", count: counts.submitted },
        ]
      : []),
  ];

  const viewingSubmission = viewing ? submissionOf(viewing) : undefined;

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Attendees"
        description="Everyone registered for this event. Click a person for details."
        actions={
          <>
            <Button
              variant="primary"
              onClick={() => {
                exportCsv(exportFilename(event.title), filtered);
                notify(`Exported ${filtered.length} rows`);
              }}
              disabled={filtered.length === 0}
            >
              <Icon icon={Download} size="sm" /> Export
            </Button>
          </>
        }
      />

      {!loading && attendees.length > 0 && (
        <FilterTiles
          tiles={tiles}
          value={filter}
          onChange={(v) => {
            setFilter(v as AttendeesFilterValue);
            setPage(1);
          }}
        />
      )}

      {!loading && attendees.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <SearchBar
            value={query}
            onChange={(v) => {
              setQuery(v);
              setPage(1);
            }}
            placeholder="Search by name or email"
            className="min-w-56 flex-1"
          />
          {hasBothPasses && (
            <Select
              aria-label="Filter by pass"
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(
                  e.target.value as AttendeesCategoryFilterValue,
                );
                setPage(1);
              }}
              className="sm:w-48"
            >
              <option value="all">All passes</option>
              <option value="Attendee">
                Attendees ({passCounts.Attendee})
              </option>
              <option value="Participant">
                Participants ({passCounts.Participant})
              </option>
            </Select>
          )}
        </div>
      )}

      {loading ? (
        <TableSkeleton rows={6} cols={5} label="Loading attendees…" />
      ) : attendees.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No registrations yet"
          description="Once people register, they show up here with their pass, payment and attendance."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No one matches"
          description="Try a different search or filter."
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setQuery("");
                setFilter("all");
                setCategoryFilter("all");
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <div className="border-border-light bg-surface-light overflow-hidden rounded-md border">
          <div className="border-border-light bg-bg-subtle flex items-center gap-3 border-b px-4 py-2.5">
            <Checkbox
              checked={allOnPageSelected}
              onChange={(e) => togglePage(e.target.checked)}
              aria-label="Select everyone on this page"
            />
            <span className="text-small text-text-secondary">
              {selectedIds.size > 0
                ? `${selectedIds.size} selected`
                : `${filtered.length} ${filtered.length === 1 ? "person" : "people"}`}
            </span>
          </div>
          <ul className="divide-border-light divide-y">
            {pageRows.map((a) => {
              const submission = submissionOf(a);
              return (
                <li
                  key={a.id}
                  className={`hover:bg-bg-subtle flex items-center gap-3 px-4 py-3 transition-colors ${
                    selectedIds.has(a.id) ? "bg-primary-light" : ""
                  }`}
                >
                  <Checkbox
                    checked={selectedIds.has(a.id)}
                    onChange={() => toggleRow(a.id)}
                    aria-label={`Select ${a.name}`}
                  />
                  <button
                    type="button"
                    onClick={() => setViewing(a)}
                    className="focus-visible:ring-primary flex min-w-0 flex-1 items-center gap-3 rounded-sm text-left hover:cursor-pointer focus-visible:ring-2 focus-visible:outline-none"
                  >
                    <Avatar
                      alt={a.name}
                      initials={a.avatarInitials}
                      size="md"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="text-body text-text-primary block truncate font-semibold">
                        {a.name}
                      </span>
                      <span className="text-small text-text-secondary block truncate">
                        {a.email} · {relativeDay(a.registeredAt)}
                      </span>
                    </span>
                    <span className="hidden flex-wrap items-center justify-end gap-1.5 md:flex">
                      <Badge
                        variant="muted"
                        tone={
                          a.category === "Participant" ? "primary" : "neutral"
                        }
                        size="sm"
                      >
                        {a.category}
                      </Badge>
                      <Badge
                        variant="muted"
                        tone={ticketTypeTone[a.ticketType]}
                        size="sm"
                      >
                        {a.ticketType}
                        {(a.quantity ?? 1) > 1 ? ` ×${a.quantity}` : ""}
                      </Badge>
                      {submission && (
                        <Badge
                          variant="muted"
                          tone={submissionStatusTone[submission]}
                          size="sm"
                        >
                          {submissionStatusLabel[submission]}
                        </Badge>
                      )}
                    </span>
                    <Badge
                      variant="muted"
                      tone={attendanceStatusTone[a.status]}
                      size="sm"
                    >
                      {attendanceStatusLabel[a.status]}
                    </Badge>
                    <Icon
                      icon={ChevronRight}
                      size="sm"
                      className="text-text-secondary"
                    />
                  </button>
                </li>
              );
            })}
          </ul>
          {filtered.length > PAGE_SIZE && (
            <div className="border-border-light flex items-center justify-between border-t px-4 py-3">
              <span className="text-small text-text-secondary">
                {(currentPage - 1) * PAGE_SIZE + 1}–
                {Math.min(currentPage * PAGE_SIZE, filtered.length)} of{" "}
                {filtered.length}
              </span>
              <Pagination
                page={currentPage}
                totalPages={totalPages}
                onPageChange={setPage}
              />
            </div>
          )}
        </div>
      )}

      {/* Floating bulk bar */}
      {selectedIds.size > 0 && (
        <div className="bg-primary fixed bottom-6 left-1/2 z-40 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-wrap items-center gap-2 rounded-md px-4 py-2.5 text-white shadow-lg">
          <span className="text-small mr-2 font-semibold">
            {selectedIds.size} selected
          </span>
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              exportCsv(
                exportFilename(event.title),
                attendees.filter((a) => selectedIds.has(a.id)),
              )
            }
          >
            <Icon icon={Download} size="sm" /> Export
          </Button>
          <Button
            size="sm"
            variant="danger"
            onClick={() => setToRemove(Array.from(selectedIds))}
          >
            <Icon icon={Trash2} size="sm" /> Remove
          </Button>
          <button
            type="button"
            onClick={() => onSelectedIdsChange(new Set())}
            className="text-small ml-1 rounded-sm px-2 font-medium text-white/80 hover:text-white"
          >
            Clear
          </button>
        </div>
      )}

      <Drawer
        open={viewing !== null}
        onClose={() => setViewing(null)}
        title={viewing?.name ?? "Attendee"}
        subtitle={viewing?.email}
        lead={
          viewing && (
            <Avatar
              alt={viewing.name}
              initials={viewing.avatarInitials}
              size="lg"
            />
          )
        }
        footer={
          viewing && (
            <>
              <Button
                variant="danger-ghost"
                size="sm"
                onClick={() => setToRemove([viewing.id])}
              >
                <Icon icon={Trash2} size="sm" /> Remove
              </Button>
            </>
          )
        }
      >
        {viewing && (
          <div className="space-y-6">
            <div className="flex flex-wrap gap-2">
              <Badge
                variant="muted"
                tone={attendanceStatusTone[viewing.status]}
                size="sm"
              >
                {attendanceStatusLabel[viewing.status]}
              </Badge>
              <Badge
                variant="muted"
                tone={
                  viewing.category === "Participant" ? "primary" : "neutral"
                }
                size="sm"
              >
                {viewing.category}
              </Badge>
              <Badge
                variant="muted"
                tone={ticketTypeTone[viewing.ticketType]}
                size="sm"
              >
                {viewing.ticketType}
              </Badge>
              {viewingSubmission && (
                <Badge
                  variant="muted"
                  tone={submissionStatusTone[viewingSubmission]}
                  size="sm"
                >
                  {submissionStatusLabel[viewingSubmission]}
                </Badge>
              )}
            </div>

            <dl>
              <DetailRow label="Phone">{viewing.phone || "—"}</DetailRow>
              <DetailRow label="Role">{viewing.role}</DetailRow>
              <DetailRow label="Registered">
                {new Date(viewing.registeredAt).toLocaleString("en-IN", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </DetailRow>
              <DetailRow label="Tickets">{viewing.quantity ?? 1}</DetailRow>
              <DetailRow label="Paid">
                {viewing.amountPaid ? `₹${viewing.amountPaid}` : "—"}
              </DetailRow>
              {viewing.ageCategory && (
                <DetailRow label="Age category">
                  {AGE_CATEGORY_LABELS[viewing.ageCategory]}
                </DetailRow>
              )}
            </dl>

            {members.length > 0 && (
              <section>
                <h3 className="text-small text-text-secondary mb-2 font-bold tracking-widest uppercase">
                  Team
                </h3>
                <ul className="space-y-1.5">
                  {members.map((m, i) => (
                    <li key={i} className="text-body">
                      {m.member_name}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {tracks.length > 0 && (
              <section>
                <h3 className="text-small text-text-secondary mb-2 font-bold tracking-widest uppercase">
                  Tracks
                </h3>
                <ul className="space-y-1.5">
                  {tracks.map((t, i) => (
                    <li key={i} className="text-small">
                      <span className="font-medium">{t.track_name}</span>
                      <a
                        href={t.youtube_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary block truncate underline"
                      >
                        {t.youtube_url}
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {viewing.audioSubmissionUrl && (
              <section>
                <h3 className="text-small text-text-secondary mb-2 font-bold tracking-widest uppercase">
                  Submission
                </h3>
                {isUploadedAudioUrl(viewing.audioSubmissionUrl) ? (
                  <audio
                    controls
                    src={`/api/audio-proxy?url=${encodeURIComponent(viewing.audioSubmissionUrl)}`}
                    className="w-full"
                  />
                ) : (
                  <a
                    href={viewing.audioSubmissionUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary text-small underline"
                  >
                    Open submission link
                  </a>
                )}
              </section>
            )}
          </div>
        )}
      </Drawer>

      <ConfirmDialog
        open={toRemove !== null}
        title="Remove from event?"
        confirmLabel="Remove"
        busy={removing}
        onConfirm={confirmRemove}
        onClose={() => setToRemove(null)}
      >
        <p>
          This cancels the registration for {removeLabel}. It can&apos;t be
          undone from here.
        </p>
      </ConfirmDialog>
    </div>
  );
}
