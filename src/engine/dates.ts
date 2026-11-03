// Calendar-day arithmetic (RULES.md section 0, CLAUDE.md rule 4).
// Dates are `YYYY-MM-DD` strings. Differences and weekdays use integer
// day numbers from Date.UTC, so daylight saving can't shift anything.

import type { LocalDate } from './types';

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

export function dayNumber(date: LocalDate): number {
  const m = DATE_RE.exec(date);
  if (!m) throw new Error(`Not a YYYY-MM-DD date: ${date}`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / MS_PER_DAY;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function fromDayNumber(n: number): LocalDate {
  const d = new Date(n * MS_PER_DAY);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function addDays(date: LocalDate, days: number): LocalDate {
  return fromDayNumber(dayNumber(date) + days);
}

/** Calendar days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: LocalDate, to: LocalDate): number {
  return dayNumber(to) - dayNumber(from);
}

/** 0 = Monday through 6 = Sunday. */
export function weekdayIndex(date: LocalDate): number {
  // Day 0 (1970-01-01) was a Thursday.
  return (((dayNumber(date) + 3) % 7) + 7) % 7;
}

export const WEEKDAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export function weekdayName(date: LocalDate): (typeof WEEKDAY_NAMES)[number] {
  return WEEKDAY_NAMES[weekdayIndex(date)] ?? 'Mon';
}

/** The Monday that starts the calendar week holding `date`. */
export function weekStart(date: LocalDate): LocalDate {
  return addDays(date, -weekdayIndex(date));
}

export function isWeekend(date: LocalDate): boolean {
  return weekdayIndex(date) >= 5;
}

/** RULES.md section 0: floor(daysBetween(startDate, date) / 7) + 1. */
export function programWeek(date: LocalDate, startDate: LocalDate): number {
  return Math.floor(daysBetween(startDate, date) / 7) + 1;
}

export function isValidDate(date: string): boolean {
  if (!DATE_RE.test(date)) return false;
  return fromDayNumber(dayNumber(date)) === date;
}

export const minDate = (a: LocalDate, b: LocalDate): LocalDate => (a < b ? a : b);
export const maxDate = (a: LocalDate, b: LocalDate): LocalDate => (a > b ? a : b);
