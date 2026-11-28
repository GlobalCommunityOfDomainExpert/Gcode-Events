import { SectionLabel } from "@/components/atoms";

export function EligibilityTermsCard({
  eligibility,
  terms,
}: {
  eligibility: string[];
  terms: string[];
}) {
  return (
    <div className="border-border-light bg-surface-light space-y-4 rounded-md border p-6">
      <div className="space-y-2">
        <SectionLabel>Eligibility</SectionLabel>
        <ul className="text-body text-text-secondary list-disc space-y-1.5 pl-5">
          {eligibility.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      </div>
      <div className="space-y-2">
        <SectionLabel>Terms &amp; Conditions</SectionLabel>
        <ul className="text-body text-text-secondary list-disc space-y-1.5 pl-5">
          {terms.map((term) => (
            <li key={term}>{term}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
