import { Calendar } from "lucide-react";
import { Icon } from "@/components/atoms";

export function DetailItem({
  icon,
  label,
  value,
  description,
}: {
  icon: typeof Calendar;
  label: string;
  value: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon icon={icon} size="sm" className="text-text-secondary mt-0.5" />
      <div>
        <p className="text-small text-text-secondary">{label}</p>
        <p className="text-body text-text-primary font-semibold">{value}</p>
        <p className="text-small text-text-secondary">{description}</p>
      </div>
    </div>
  );
}
