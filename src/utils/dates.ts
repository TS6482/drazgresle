// Small calendar-date helpers (ISO `YYYY-MM-DD`). No time-of-day, no timezone
// surprises — we work with the local calendar date and integer day counts.

/** Today's local calendar date as `YYYY-MM-DD`. */
export function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Whole days from `fromIso` to `toIso` (negative if `toIso` is earlier). */
export function daysBetween(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split('-').map(Number);
  const [ty, tm, td] = toIso.split('-').map(Number);
  const from = Date.UTC(fy, fm - 1, fd);
  const to = Date.UTC(ty, tm - 1, td);
  return Math.round((to - from) / 86_400_000);
}

/** Compact axis/label form of an ISO date, e.g. "3/26" for 2026-03-xx. */
export function formatShortDate(iso: string): string {
  const [y, m] = iso.split('-');
  return `${Number(m)}/${y.slice(2)}`;
}
