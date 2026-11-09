import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { Badge, Button, Progress } from "@/components/atoms";
import { EmptyState, StatCard } from "@/components/molecules";
import { ticketTypeTone } from "@/app/(app)/(events)/my-organized-events/[id]/_components/status-maps";
import { Attendee } from "@/lib/attendees";
import { RegistrationTrendChart } from "@/app/(app)/(events)/my-organized-events/[id]/_components/registration-trend-chart";
import { eventTypeTone, priceTone } from "@/lib/event";
import { isDashboardEvent } from "@/lib/client-dashboard/config";
import { getDashboardData } from "@/lib/client-dashboard/data";
import { daysUntilClose } from "@/lib/client-dashboard/format";
import { cookieName, verifySessionValue } from "@/lib/client-dashboard/session";
import { logoutAction } from "./login/actions";

export const metadata = { title: "Client Dashboard" };
export const dynamic = "force-dynamic";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-small text-text-secondary mb-3 flex items-center gap-2 font-bold tracking-widest uppercase">
      {children} <span className="bg-border-light h-px flex-1" />
    </p>
  );
}

interface AttendeeColumn {
  key: string;
  header: string;
  render: (row: Attendee) => React.ReactNode;
}

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const priceText = (price: number) =>
  price > 0 ? `${inr(price)} / ticket` : "Free";

// The shared <Table> wires an onClick onto every row, which can't be rendered
// from a server component, so this page renders the same markup directly.
const buildColumns = (labels: {
  Attendee: string;
  Participant: string;
}): AttendeeColumn[] => [
  {
    key: "name",
    header: "Name",
    render: (row) => <span className="text-text-primary">{row.name}</span>,
  },
  {
    key: "email",
    header: "Email",
    render: (row) => (
      <span className="text-text-secondary">{row.email || "—"}</span>
    ),
  },
  {
    key: "phone",
    header: "Phone",
    render: (row) => (
      <span className="text-text-secondary">{row.phone || "—"}</span>
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
        {labels[row.category]}
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
    key: "amount",
    header: "Amount",
    render: (row) => (
      <span className="text-text-secondary">{inr(row.amountPaid ?? 0)}</span>
    ),
  },
];

export default async function ClientDashboardPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  if (!isDashboardEvent(eventId)) notFound();

  const token = (await cookies()).get(cookieName(eventId))?.value;
  if (!verifySessionValue(token, eventId)) redirect(`/client/${eventId}/login`);

  const data = await getDashboardData(eventId);
  if (!data) notFound();
  const { event, attendees } = data;

  const registration = event.attendeeRegistration;
  const participantReg = event.participantRegistration;
  const attendeeColumns = buildColumns({
    Attendee: registration.label,
    Participant: participantReg.label,
  });
  const capacityPercent = event.capacity
    ? Math.min(100, Math.round((data.registrations / event.capacity) * 100))
    : null;
  const daysLeftCards = [registration, participantReg].map((category) => ({
    label: category.label,
    days: daysUntilClose(category.registrationDeadlineIso, event.date),
    closes: category.registrationCloses,
  }));

  return (
    <main className="bg-bg-light min-h-screen px-4 py-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="border-border-light bg-surface-light rounded-md border p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="muted" tone="success" size="sm">
                  ● Live
                </Badge>
                <Badge tone={eventTypeTone(event.type)} size="sm">
                  {event.type}
                </Badge>
                <Badge tone="neutral" size="sm">
                  {event.mode}
                </Badge>
                <Badge tone={priceTone(event.price)} size="sm">
                  {event.price}
                </Badge>
              </div>
              <h1 className="text-heading text-text-primary font-extrabold">
                {event.title}
              </h1>
              <p className="text-small text-text-secondary">
                {event.date} · {event.time} · {event.mode}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-5">
              <div className="text-center">
                <p className="text-heading text-text-primary font-extrabold">
                  {data.registrations}
                </p>
                <p className="text-small text-text-secondary tracking-wide uppercase">
                  Registered
                </p>
              </div>
              {event.capacity !== undefined && (
                <>
                  <div className="bg-border-light h-10 w-px" />
                  <div className="text-center">
                    <p className="text-heading text-text-primary font-extrabold">
                      {event.capacity}
                    </p>
                    <p className="text-small text-text-secondary tracking-wide uppercase">
                      Capacity
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="border-border-light mt-4 flex flex-wrap items-center gap-2 border-t pt-4">
            <form action={logoutAction}>
              <input type="hidden" name="eventId" value={eventId} />
              <Button type="submit" variant="secondary" size="sm">
                Log out
              </Button>
            </form>
          </div>
        </div>

        <div className="border-border-light bg-surface-light space-y-6 rounded-md border p-4">
          <div>
            <SectionLabel>Overview</SectionLabel>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Registrations"
                value={data.registrations.toLocaleString()}
                sub={event.capacity ? `${event.capacity} capacity` : undefined}
                trend={
                  data.registeredThisWeek > 0
                    ? {
                        value: `+${data.registeredThisWeek} this week`,
                        tone: "success",
                      }
                    : undefined
                }
              />
              <StatCard
                label="Revenue"
                value={inr(data.revenueInr)}
                sub={
                  data.paidTickets > 0
                    ? `Sum of all tickets · ${data.paidTickets} paid registrations`
                    : "Free event"
                }
              />
              <StatCard
                label={registration.label}
                value={data.attendeeCount.toLocaleString()}
                sub={priceText(registration.price)}
              />
              <StatCard
                label={participantReg.label}
                value={data.participantCount.toLocaleString()}
                sub={priceText(participantReg.price)}
              />
              <div className="border-border-light bg-surface-light rounded-md border p-4 transition-shadow hover:shadow-md">
                <p className="text-small text-text-secondary font-medium tracking-wide uppercase">
                  Capacity
                </p>
                <span className="text-heading text-text-primary mt-1 block font-extrabold">
                  {capacityPercent !== null
                    ? `${capacityPercent}%`
                    : "Unlimited"}
                </span>
                {capacityPercent !== null && (
                  <Progress
                    value={capacityPercent}
                    className="mt-2"
                    label="Capacity filled"
                  />
                )}
              </div>
              {daysLeftCards.map((card) => (
                <StatCard
                  key={card.label}
                  label={`Days Left · ${card.label}`}
                  value={card.days !== null ? String(card.days) : "—"}
                  sub={`Closes ${card.closes}`}
                />
              ))}
            </div>
          </div>

          <RegistrationTrendChart attendees={attendees} />

          <div>
            <SectionLabel>Registrations ({attendees.length})</SectionLabel>
            {attendees.length === 0 ? (
              <EmptyState title="No registrations yet" />
            ) : (
              <div className="border-border-light bg-surface-light overflow-x-auto rounded-md border">
                <table className="text-small w-full text-left">
                  <thead>
                    <tr className="border-border-light border-b">
                      {attendeeColumns.map((column) => (
                        <th
                          key={column.key}
                          className="text-text-secondary text-small px-3 py-3 font-medium tracking-wide uppercase"
                        >
                          {column.header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {attendees.map((row) => (
                      <tr
                        key={row.id}
                        className="border-border-light hover:bg-bg-light border-b last:border-0"
                      >
                        {attendeeColumns.map((column) => (
                          <td key={column.key} className="px-3 py-3">
                            {column.render(row)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
