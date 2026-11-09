// Days until the registration deadline, falling back to the event date.
export function daysUntilClose(
  deadlineIso: string | null | undefined,
  fallbackDateStr: string,
): number | null {
  const target = new Date(deadlineIso || fallbackDateStr);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.max(
    0,
    Math.round((target.getTime() - today.getTime()) / 86_400_000),
  );
}
