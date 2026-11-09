// "No time today" (RULES.md section 1, Q22). A lifting session skipped for
// lack of time moves to the next day, and the rest of its week moves with it,
// a day each. The weekend takes what moves there: Saturday first, then
// Sunday if Saturday is skipped too. Whatever is pushed past Sunday drops. A
// skipped conditioning session drops and moves nothing.

import { addDays, weekdayIndex, weekStart } from './dates';
import { READINGS } from './readings';
import type { EngineState, SkipRecord } from './state';
import type { LocalDate } from './types';

/** A skip holds only while no session is logged on its day: finding the time after all cancels it. Extra minutes don't. */
function holds(st: EngineState, k: SkipRecord): boolean {
  return !st.sessions.some((r) => r.date === k.date) && !st.condSessions.some((c) => c.date === k.date && !c.event.extra);
}

/** The skip on `date`, if one holds. */
export function skipOn(st: EngineState, date: LocalDate): SkipRecord | null {
  for (let i = st.skips.length - 1; i >= 0; i--) {
    const k = st.skips[i]!;
    if (k.date === date && holds(st, k)) return k;
  }
  return null;
}

/** How many days `date`'s week has moved by then: its lifting skips on earlier days. */
export function weekShift(st: EngineState, date: LocalDate): number {
  if (!READINGS.NO_TIME_SKIP_MOVES_WEEK) return 0;
  const ws = weekStart(date);
  const days = new Set<LocalDate>();
  for (const k of st.skips) {
    if (k.kind === 'lifting' && k.date < date && k.date >= ws && holds(st, k)) days.add(k.date);
  }
  return days.size;
}

/**
 * The day of the default week whose session falls on `date`: `date` itself
 * in a week nothing has moved, or null on a weekend day nothing has moved to.
 */
export function slotSource(st: EngineState, date: LocalDate): LocalDate | null {
  const source = addDays(date, -weekShift(st, date));
  return weekdayIndex(source) <= 4 ? source : null;
}

/** The last day of `date`'s week a session can fall on: Friday, or Sunday once a skip has moved the week (section 6). */
export function lastSessionDay(st: EngineState, date: LocalDate): LocalDate {
  return addDays(weekStart(date), weekShift(st, date) > 0 ? 6 : 4);
}
