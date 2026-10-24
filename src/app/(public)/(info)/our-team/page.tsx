import type { Metadata } from "next";
import { ButtonLink } from "@/components/atoms";

export const metadata: Metadata = {
  title: "Our Team – GCODE Events",
  description:
    "Meet the people behind GCODE Events, the community-driven platform for hackathons, ideathons, AMAs, webinars and workshops.",
};

interface TeamMember {
  name: string;
  role?: string;
  /** Optional photo in /public; falls back to initials. */
  photo?: string;
}

const teamMembers: TeamMember[] = [
  { name: "Srinivas", role: "Ex Accenture", photo: "/srini.jpg" },
  { name: "Arup Mohanty", role: "Ex Oracle", photo: "/Arup.jpg" },
  { name: "Arun Mohan", role: "CTO at Maathra", photo: "/Arun.jpg" },
  { name: "Manoj Lewis", role: "Ex Dell", photo: "/Manoj.jpg" },
];

const advisors: TeamMember[] = [
  {
    name: "Vishwanath Rajagopal",
    role: "Ex NielsenIQ",
    photo: "/vishi.jpg",
  },
  {
    name: "Gurucharan Singh",
    role: "Group Chief Human Resource Officer & Corporate Relations at Sapthagiri NPS University",
    photo: "/guru.jpg",
  },
  { name: "Satish", role: "Ex Birlasoft", photo: "/satish.jpg" },
  { name: "Jeevan", role: "Ex Microsoft", photo: "/Jeevan.jpg" },
  {
    name: "Avil Rakshith Salins",
    role: "Salins & Co",
    photo: "/avil.jpg",
  },
  {
    name: "Guru Raja Bhata",
    role: "Co Founder at Kredo Analytics Pvt",
    photo: "/gururaja.jpg",
  },
  {
    name: "Gyanveer Singh",
    role: "LexAnalytico",
    photo: "/Gyanveer.jpg",
  },
  {
    name: "Anantharaman",
    role: "Ex SASTRA's Technology Business Incubator",
    photo: "/raman.jpg",
  },
  { name: "Anil Mohanty", role: "Ex DN Homes", photo: "/anil.jpg" },
  {
    name: "Pooja Singh",
    role: "Co Founder at Excellential Consulting Services",
    photo: "/pooja.jpg",
  },
];

function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function MemberSection({
  id,
  title,
  members,
}: {
  id: string;
  title: string;
  members: TeamMember[];
}) {
  return (
    <section aria-labelledby={id} className="space-y-6">
      <div className="border-border-light flex items-center gap-3 border-b pb-3">
        <span
          aria-hidden="true"
          className="bg-secondary h-9 w-1.5 rounded-full"
        />
        <h2 id={id} className="text-display text-text-primary font-extrabold">
          {title}
        </h2>
        <span className="bg-primary-light text-body text-primary rounded-full px-3 py-0.5 font-semibold">
          {members.length}
        </span>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {members.map((member) => (
          <li
            key={member.name}
            className="group border-border-light bg-surface-light overflow-hidden rounded-md border transition-shadow hover:shadow-md"
          >
            <div className="bg-bg-light text-text-secondary relative flex aspect-[4/3] items-center justify-center overflow-hidden">
              {member.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={member.photo}
                  alt={member.name}
                  className="size-full object-cover object-top transition-transform duration-500 group-hover:scale-105"
                />
              ) : (
                <span
                  aria-hidden="true"
                  className="text-display text-text-secondary font-bold"
                >
                  {initialsOf(member.name)}
                </span>
              )}
            </div>
            <div className="p-5">
              <h3 className="text-body text-text-primary font-semibold">
                {member.name}
              </h3>
              {member.role && (
                <p className="text-small text-text-secondary">{member.role}</p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function OurTeamPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-16">
      <header className="bg-primary rounded-md px-6 py-10 text-white sm:px-10 sm:py-14">
        <div className="max-w-2xl space-y-3">
          <div className="flex items-center gap-3">
            <span className="bg-secondary h-0.5 w-8 rounded-full" />
            <p className="text-small font-semibold tracking-widest text-white/70 uppercase">
              The people behind GCODE
            </p>
          </div>
          <h1 className="text-display font-extrabold">Our Team</h1>
          <p className="text-large text-white/75">
            GCODE Events is built by people passionate about learning, community
            and technology.
          </p>
        </div>
      </header>

      <MemberSection
        id="team-heading"
        title="Core Team"
        members={teamMembers}
      />

      <MemberSection
        id="advisory-heading"
        title="Advisory"
        members={advisors}
      />

      <section className="border-border-light bg-surface-light flex flex-col items-start justify-between gap-4 rounded-md border p-6 sm:flex-row sm:items-center">
        <p className="text-body text-text-secondary">
          Want to get in touch? We&apos;d love to hear from you.
        </p>
        <ButtonLink href="/contact-us" variant="primary" size="md">
          Contact Us
        </ButtonLink>
      </section>
    </div>
  );
}
