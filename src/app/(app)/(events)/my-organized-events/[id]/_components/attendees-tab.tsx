"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge, Blurred, RemoveIconButton } from "@/components/atoms";
import {
  Banner,
  BulkActionBar,
  Chip,
  Modal,
  Pagination,
  SearchBar,
  Table,
  TableColumn,
  Tabs,
} from "@/components/molecules";
import {
  ATTENDEES_CSV_HEADERS,
  Attendee,
  attendeesCsvRows,
  audioSubmissionStatus,
  isUploadedAudioUrl,
} from "@/lib/attendees";
import { downloadCsv } from "@/lib/csv";
import { Event } from "@/lib/event";
import {
  listParticipantTeamMembers,
  listParticipantYoutubeTracks,
  ParticipantTeamMemberApi,
  ParticipantYoutubeTrackApi,
  removeParticipant,
} from "@/lib/api/participants";
import { ApiError } from "@/lib/api/client";
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
  selectedIds: Set<string>;
  onSelectedIdsChange: (ids: Set<string>) => void;
  onNavigateToCommunication: () => void;
  // Refetches the attendee list after a remove — same callback the parent
  // page already threads into RoundsTab.
  onAttendeesChanged: () => void;
}

const PAGE_SIZE = 8;

function exportCsv(filename: string, attendees: Attendee[]) {
  downloadCsv(filename, ATTENDEES_CSV_HEADERS, attendeesCsvRows(attendees));
}

export function AttendeesTab({
  event,
  attendees,
  selectedIds,
  onSelectedIdsChange,
  onNavigateToCommunication,
  onAttendeesChanged,
}: AttendeesTabProps) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<AttendeesFilterValue>("all");
  const [categoryFilter, setCategoryFilter] =
    useState<AttendeesCategoryFilterValue>("all");
  const [page, setPage] = useState(1);
  const [viewingAttendee, setViewingAttendee] = useState<Attendee | null>(null);
  const [viewingTracks, setViewingTracks] = useState<
    ParticipantYoutubeTrackApi[]
  >([]);
  const [viewingMembers, setViewingMembers] = useState<
    ParticipantTeamMemberApi[]
  >([]);
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const submissionDeadlineIso =
    event.participantRegistration.registrationDeadlineIso;

  // Tracks/team members are participant-submitted child lists, not part of
  // the Attendee row itself — fetch them only when the detail panel opens
  // for a Participant-category row (Attendee rows never have them).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!viewingAttendee || viewingAttendee.category !== "Participant") {
        if (!cancelled) {
          setViewingTracks([]);
          setViewingMembers([]);
        }
        return;
      }
      try {
        const [tracks, members] = await Promise.all([
          listParticipantYoutubeTracks(viewingAttendee.id),
          listParticipantTeamMembers(viewingAttendee.id),
        ]);
        if (!cancelled) {
          setViewingTracks(tracks);
          setViewingMembers(members);
        }
      } catch {
        // best-effort — panel just won't show these if the fetch fails
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [viewingAttendee]);

  async function handleRemove(ids: string[]) {
    if (ids.length === 0) return;
    const label =
      ids.length === 1
        ? (attendees.find((a) => a.id === ids[0])?.name ?? "this attendee")
        : `${ids.length} attendees`;
    if (
      !window.confirm(
        `Remove ${label}? This cancels their registration — it can't be undone from here.`,
      )
    ) {
      return;
    }
    setRemovingIds(new Set(ids));
    setError("");
    try {
      await Promise.all(ids.map((id) => removeParticipant(id)));
      const next = new Set(selectedIds);
      ids.forEach((id) => next.delete(id));
      onSelectedIdsChange(next);
      onAttendeesChanged();
    } catch (err) {
      setError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : "Couldn't remove one or more attendees.",
      );
    } finally {
      setRemovingIds(new Set());
    }
  }

  const counts = useMemo(
    () => ({
      all: attendees.length,
      paid: attendees.filter((a) => a.ticketType === "Paid").length,
      free: attendees.filter((a) => a.ticketType === "Free").length,
      attended: attendees.filter((a) => a.status === "attended").length,
      missed: attendees.filter((a) => a.status === "missed").length,
      submitted: attendees.filter(
        (a) =>
          audioSubmissionStatus(
            a,
            submissionDeadlineIso,
            event.audioRecordingEnabled,
          ) === "submitted",
      ).length,
      pending: attendees.filter(
        (a) =>
          audioSubmissionStatus(
            a,
            submissionDeadlineIso,
            event.audioRecordingEnabled,
          ) === "pending",
      ).length,
    }),
    [attendees, submissionDeadlineIso, event.audioRecordingEnabled],
  );

  const categoryCounts = useMemo(
    () => ({
      all: attendees.length,
      Attendee: attendees.filter((a) => a.category === "Attendee").length,
      Participant: attendees.filter((a) => a.category === "Participant").length,
    }),
    [attendees],
  );

  const filtered = useMemo(() => {
    return attendees.filter((attendee) => {
      if (filter === "paid" && attendee.ticketType !== "Paid") return false;
      if (filter === "free" && attendee.ticketType !== "Free") return false;
      if (filter === "attended" && attendee.status !== "attended") return false;
      if (filter === "missed" && attendee.status !== "missed") return false;
      if (
        (filter === "submitted" || filter === "pending") &&
        audioSubmissionStatus(
          attendee,
          submissionDeadlineIso,
          event.audioRecordingEnabled,
        ) !== filter
      )
        return false;
      if (categoryFilter !== "all" && attendee.category !== categoryFilter)
        return false;
      if (query.trim()) {
        const haystack = `${attendee.name} ${attendee.email}`.toLowerCase();
        if (!haystack.includes(query.trim().toLowerCase())) return false;
      }
      return true;
    });
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

  function changeFilter(next: AttendeesFilterValue) {
    setFilter(next);
    setPage(1);
  }

  function toggleRow(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedIdsChange(next);
  }

  function toggleAll(checked: boolean) {
    if (!checked) {
      onSelectedIdsChange(new Set());
      return;
    }
    onSelectedIdsChange(new Set(pageRows.map((row) => row.id)));
  }

  const selectedAttendees = attendees.filter((attendee) =>
    selectedIds.has(attendee.id),
  );

  const columns: TableColumn<Attendee>[] = [
    {
      key: "name",
      header: "Name",
      render: (row) => <span className="text-text-primary">{row.name}</span>,
    },
    {
      key: "role",
      header: "Role",
      render: (row) => (
        <Badge variant="muted" tone="neutral" size="sm">
          {row.role}
        </Badge>
      ),
    },
    {
      key: "category",
      header: "Category",
      render: (row) => (
        <Badge
          variant="muted"
          tone={row.category === "Participant" ? "primary" : "neutral"}
          size="sm"
        >
          {row.category}
        </Badge>
      ),
    },
    {
      key: "registered",
      header: "Registered",
      render: (row) => (
        <span className="text-text-secondary">
          {new Date(row.registeredAt).toLocaleDateString("en-IN")}
        </span>
      ),
    },
    {
      key: "payment",
      header: "Payment",
      render: (row) => (
        <Badge variant="muted" tone={ticketTypeTone[row.ticketType]} size="sm">
          {row.ticketType}
        </Badge>
      ),
    },
    {
      key: "tickets",
      header: "Tickets",
      render: (row) => (
        <span className="text-text-secondary">{row.quantity ?? 1}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <Badge
          variant="muted"
          tone={attendanceStatusTone[row.status]}
          size="sm"
        >
          {attendanceStatusLabel[row.status]}
        </Badge>
      ),
    },
    ...(event.audioRecordingEnabled
      ? [
          {
            key: "submission",
            header: "Submission",
            render: (row: Attendee) => {
              const submission = audioSubmissionStatus(
                row,
                submissionDeadlineIso,
                event.audioRecordingEnabled,
              );
              if (!submission) {
                return <span className="text-text-secondary">—</span>;
              }
              return (
                <Badge
                  variant="muted"
                  tone={submissionStatusTone[submission]}
                  size="sm"
                >
                  {submissionStatusLabel[submission]}
                </Badge>
              );
            },
          } satisfies TableColumn<Attendee>,
        ]
      : []),
    {
      key: "remove",
      header: "",
      // Table's row-click-to-open-modal doesn't stop propagation for
      // ordinary column cells (only the selection checkbox does) — this
      // span does it here so clicking Remove doesn't also pop the detail
      // modal open underneath the confirm dialog.
      render: (row) => (
        <span
          onClick={(e) => e.stopPropagation()}
          className={
            removingIds.has(row.id) ? "pointer-events-none opacity-50" : ""
          }
        >
          <RemoveIconButton
            onClick={() => handleRemove([row.id])}
            ariaLabel={`Remove ${row.name}`}
          />
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {error && <Banner tone="danger">{error}</Banner>}
      <Tabs
        items={[
          { value: "all", label: `All (${categoryCounts.all})` },
          {
            value: "Attendee",
            label: `Attendees (${categoryCounts.Attendee})`,
          },
          {
            value: "Participant",
            label: `Participants (${categoryCounts.Participant})`,
          },
        ]}
        value={categoryFilter}
        onChange={(value) => {
          setCategoryFilter(value as AttendeesCategoryFilterValue);
          setPage(1);
        }}
      />

      <div className="flex flex-wrap items-center gap-3">
        <SearchBar
          value={query}
          onChange={(value) => {
            setQuery(value);
            setPage(1);
          }}
          placeholder="Search attendees…"
          className="min-w-48 flex-1"
        />
        <div className="flex flex-wrap gap-1.5">
          <Chip selected={filter === "all"} onClick={() => changeFilter("all")}>
            All ({counts.all})
          </Chip>
          <Chip
            selected={filter === "paid"}
            onClick={() => changeFilter("paid")}
          >
            Paid ({counts.paid})
          </Chip>
          <Chip
            selected={filter === "free"}
            onClick={() => changeFilter("free")}
          >
            Free ({counts.free})
          </Chip>
          <Chip
            selected={filter === "attended"}
            onClick={() => changeFilter("attended")}
          >
            Attended ({counts.attended})
          </Chip>
          <Chip
            selected={filter === "missed"}
            onClick={() => changeFilter("missed")}
          >
            Missed ({counts.missed})
          </Chip>
          {event.audioRecordingEnabled && (
            <>
              <Chip
                selected={filter === "submitted"}
                onClick={() => changeFilter("submitted")}
              >
                Submitted ({counts.submitted})
              </Chip>
              <Chip
                selected={filter === "pending"}
                onClick={() => changeFilter("pending")}
              >
                Pending Submission ({counts.pending})
              </Chip>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={() => exportCsv(`${event.id}-attendees.csv`, filtered)}
          className="text-small text-text-secondary hover:text-text-primary border-border-light shrink-0 rounded-md border px-4 py-1.5 font-semibold"
        >
          ⬇ Export CSV
        </button>
      </div>

      <BulkActionBar
        selectedCount={selectedIds.size}
        onClear={() => onSelectedIdsChange(new Set())}
        actions={[
          {
            label: "📧 Send Email to Selected",
            onClick: onNavigateToCommunication,
            variant: "ghost",
          },
          {
            label: "⬇ Export Selected",
            onClick: () =>
              exportCsv(
                `${event.id}-selected-attendees.csv`,
                selectedAttendees,
              ),
            variant: "ghost",
          },
          {
            label: "Remove Selected",
            onClick: () => handleRemove(Array.from(selectedIds)),
            variant: "ghost",
          },
        ]}
      />

      <Table
        columns={columns}
        rows={pageRows}
        rowKey={(row) => row.id}
        selectable
        selectedKeys={selectedIds}
        onToggleRow={toggleRow}
        onToggleAll={toggleAll}
        onRowClick={setViewingAttendee}
        emptyState={
          <div className="border-border-light bg-surface-light rounded-md border p-8 text-center">
            <p className="text-body text-text-secondary">
              No attendees match these filters.
            </p>
          </div>
        }
      />

      {filtered.length > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-small text-text-secondary">
            Showing {pageRows.length} of {filtered.length}
          </span>
          <Pagination
            page={currentPage}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        </div>
      )}

      <Modal
        open={viewingAttendee !== null}
        onClose={() => setViewingAttendee(null)}
        title={viewingAttendee?.name ?? "Attendee"}
      >
        {viewingAttendee && (
          <div className="text-body text-text-primary space-y-2">
            <p>
              <span className="text-text-secondary">Email:</span>{" "}
              {viewingAttendee.email}
            </p>
            <p>
              <span className="text-text-secondary">Phone:</span>{" "}
              {viewingAttendee.phone || "—"}
            </p>
            <p>
              <span className="text-text-secondary">Role:</span>{" "}
              {viewingAttendee.role}
            </p>
            <p>
              <span className="text-text-secondary">Category:</span>{" "}
              {viewingAttendee.category}
            </p>
            <p>
              <span className="text-text-secondary">Registered:</span>{" "}
              {new Date(viewingAttendee.registeredAt).toLocaleString("en-IN")}
            </p>
            <p>
              <span className="text-text-secondary">Payment:</span>{" "}
              {viewingAttendee.ticketType}
              {viewingAttendee.amountPaid
                ? ` · ₹${viewingAttendee.amountPaid}`
                : ""}
            </p>
            <p>
              <span className="text-text-secondary">Tickets:</span>{" "}
              {viewingAttendee.quantity ?? 1}
            </p>
            <p>
              <span className="text-text-secondary">Status:</span>{" "}
              {attendanceStatusLabel[viewingAttendee.status]}
            </p>
            {viewingAttendee.ageCategory && (
              <p>
                <span className="text-text-secondary">Age category:</span>{" "}
                {AGE_CATEGORY_LABELS[viewingAttendee.ageCategory]}
              </p>
            )}
            {viewingMembers.length > 0 && (
              <div>
                <span className="text-text-secondary">Team members:</span>
                <ul className="mt-1 list-inside list-disc">
                  {viewingMembers.map((member, index) => (
                    <li key={index}>{member.member_name}</li>
                  ))}
                </ul>
              </div>
            )}
            {viewingTracks.length > 0 && (
              <div>
                <span className="text-text-secondary">Tracks:</span>
                <ul className="mt-1 list-inside list-disc">
                  {viewingTracks.map((track, index) => (
                    <li key={index}>
                      {track.track_name}:{" "}
                      <a
                        href={track.youtube_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline"
                      >
                        {track.youtube_url}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {audioSubmissionStatus(
              viewingAttendee,
              submissionDeadlineIso,
              event.audioRecordingEnabled,
            ) && (
              <p>
                <span className="text-text-secondary">Submission:</span>{" "}
                {
                  submissionStatusLabel[
                    audioSubmissionStatus(
                      viewingAttendee,
                      submissionDeadlineIso,
                      event.audioRecordingEnabled,
                    )!
                  ]
                }
                {viewingAttendee.audioSubmissionUrl &&
                  !isUploadedAudioUrl(viewingAttendee.audioSubmissionUrl) && (
                    <>
                      {" · "}
                      <a
                        href={viewingAttendee.audioSubmissionUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline"
                      >
                        View submission
                      </a>
                    </>
                  )}
              </p>
            )}
            {viewingAttendee.audioSubmissionUrl &&
              isUploadedAudioUrl(viewingAttendee.audioSubmissionUrl) && (
                <audio
                  controls
                  src={`/api/audio-proxy?url=${encodeURIComponent(viewingAttendee.audioSubmissionUrl)}`}
                  className="mt-2 w-full"
                />
              )}
          </div>
        )}
      </Modal>
    </div>
  );
}
