import { Globe } from "lucide-react";
import { Icon } from "@/components/atoms";

// Stand-in for the wireframe's OnlineJoinPanel (webinar flow is out of
// scope): a static card; joining details come with registration.
export function OnlineInfoCard() {
  return (
    <div className="border-border-light bg-surface-light flex items-start gap-3 rounded-lg border p-5 shadow-sm">
      <span className="bg-secondary-light text-secondary flex size-10 shrink-0 items-center justify-center rounded-md">
        <Icon icon={Globe} size="sm" />
      </span>
      <div className="min-w-0">
        <p className="text-text-primary font-semibold">Online event</p>
        <p className="text-small text-text-secondary mt-0.5">
          Joining details are shared with registered attendees.
        </p>
      </div>
    </div>
  );
}
