/** Formats a Date as YYYY-MM-DD in the *browser's local* timezone.
 *
 * `date.toISOString().slice(0, 10)` is the UTC date, which flips to
 * "tomorrow" at 6 PM Central (7 PM in summer) — so a Waco business opening
 * the dashboard in the evening saw "Today" pointing at a day with no data.
 * Dashboard date ranges are calendar days as the viewer sees them, so they
 * use local time instead. */
export function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
