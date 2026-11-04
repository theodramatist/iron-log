// Formatting for the screens. Dates are calendar dates, so they're read in
// UTC to keep the weekday right in every time zone.

import { formatLb, type EffortRating, type LocalDate, type Program } from '../engine';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function parts(date: LocalDate): { y: number; m: number; d: number; wd: number } {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return { y, m, d, wd: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}

/** "Monday, November 2" */
export function longDate(date: LocalDate): string {
  const p = parts(date);
  return `${DAYS[p.wd]}, ${MONTHS[p.m - 1]} ${p.d}`;
}

/** "Mon, Nov 2" */
export function shortDate(date: LocalDate): string {
  const p = parts(date);
  return `${DAYS[p.wd]!.slice(0, 3)}, ${MONTHS[p.m - 1]!.slice(0, 3)} ${p.d}`;
}

/** "Nov 2 to 8", or "Nov 30 to Dec 6" across a month. */
export function weekRange(monday: LocalDate, sunday: LocalDate): string {
  const a = parts(monday);
  const b = parts(sunday);
  const month = (m: number) => MONTHS[m - 1]!.slice(0, 3);
  return a.m === b.m ? `${month(a.m)} ${a.d} to ${b.d}` : `${month(a.m)} ${a.d} to ${month(b.m)} ${b.d}`;
}

/** "Mon" */
export function weekdayShort(date: LocalDate): string {
  return DAYS[parts(date).wd]!.slice(0, 3);
}

/** 210 -> "3:30" */
export function clock(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** A local wall-clock time, "7:45". */
export function wallTime(ms: number): string {
  const d = new Date(ms);
  return `${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export const lb = formatLb;

/** "25 + 10 per side", or "Empty bar". */
export function platesText(plates: readonly number[]): string {
  return plates.length === 0 ? 'Empty bar' : `${plates.map(formatLb).join(' + ')} per side`;
}

/** Effort labels come from program.json (CLAUDE.md, ground rule 8). */
export function effortLabel(program: Program, rating: EffortRating): string {
  const all = [...program.effort.categories, ...program.effort.cleanRowCategories];
  return all.find((c) => c.id === rating)?.label ?? rating;
}

export function spareLabel(spare: 0 | 1 | 2): string {
  return spare === 2 ? '2+' : String(spare);
}
