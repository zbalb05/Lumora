/**
 * Formats a date as its local calendar day (YYYY-MM-DD). Deliberately avoids
 * `toISOString().slice(0, 10)`, which converts to UTC first — for anyone in a positive UTC
 * offset (most of Asia, Australia, etc.), that rolls local midnight back to the previous day.
 */
export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Weeks (Sun-Sat) of a given month, padded with `null` outside the month's range. */
export function getMonthGrid(year: number, month: number): (Date | null)[][] {
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (Date | null)[] = new Array(firstDay.getDay()).fill(null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(new Date(year, month, day));
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
}

/** Consecutive days ending today (or yesterday, if today has no activity yet) present in `activeDates`. */
export function computeStreak(activeDates: Set<string>): number {
  let streak = 0;
  const cursor = new Date();
  if (!activeDates.has(toDateKey(cursor))) cursor.setDate(cursor.getDate() - 1);

  while (activeDates.has(toDateKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
