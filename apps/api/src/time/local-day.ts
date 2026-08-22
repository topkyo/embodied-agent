export function localDateKey(value: string | Date, timeZone: string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${String(value)}`);
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const byType = new Map(parts.map((p) => [p.type, p.value]));
  return `${byType.get("year")}-${byType.get("month")}-${byType.get("day")}`;
}

export function isSameLocalDay(value: string, day: Date, timeZone: string): boolean {
  return localDateKey(value, timeZone) === localDateKey(day, timeZone);
}
