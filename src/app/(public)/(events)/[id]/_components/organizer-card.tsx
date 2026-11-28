import { withBasePath } from "@/lib/base-path";
export function OrganizerCard() {
  return (
    <div className="bg-primary space-y-3 rounded-md p-6">
      <p className="text-small font-bold tracking-widest text-white/70 uppercase">
        About organizer
      </p>
      <img
        src={withBasePath("/app-logo.png")}
        alt="GCODE"
        className="h-10 w-auto object-contain"
      />
      <p className="text-body text-white/80">
        GCODE, the Global Community of Domain Experts, is dedicated to fostering
        collaboration between startups, industry, and academia. We focus on
        creating unique partnerships by involving domain experts and interns to
        facilitate innovation and knowledge sharing. We offer advisory services
        and support connections between industry and academia to drive impactful
        collaborations. If you&apos;d like to learn more about scheduling with
        our domain experts, feel free to reach out.
      </p>
    </div>
  );
}
