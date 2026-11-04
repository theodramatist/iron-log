// Week types, floor weeks, illness, and maintenance breaks (RULES.md sections 1, 10, 13).

import { addDays, weekStart } from './dates';
import { maintenanceBreaks, type Break } from './programAccess';
import { READINGS } from './readings';
import type { EngineState } from './state';
import type { LocalDate, Program, WeekType } from './types';

export function isFloorWeek(st: EngineState, ws: LocalDate): boolean {
  const override = st.floorOverrides.get(ws);
  if (override !== undefined) return override;
  return st.program.deload.scheduledFloorWeeks.some((f) => weekStart(f.start) === ws);
}

/** The earliest light-week marker in the calendar week starting `ws`. */
export function lightFrom(st: EngineState, ws: LocalDate): LocalDate | null {
  let first: LocalDate | null = null;
  for (const m of st.lightMarkers) if (weekStart(m) === ws && (first === null || m < first)) first = m;
  return first;
}

/** The weekend days of a preloaded floor week, when only its listed days count (Q7). */
function outsideScheduledDays(st: EngineState, date: LocalDate): boolean {
  const f = st.program.deload.scheduledFloorWeeks.find((w) => weekStart(w.start) === weekStart(date));
  return f !== undefined && (date < f.start || date > f.end);
}

/** What today's sessions are: a floor week covers its whole calendar week, a light week runs from its marker. */
export function weekTypeOn(st: EngineState, date: LocalDate): WeekType {
  const ws = weekStart(date);
  if (isFloorWeek(st, ws) && (READINGS.FLOOR_WEEK_IS_CALENDAR_WEEK || !outsideScheduledDays(st, date))) return 'floor';
  const from = lightFrom(st, ws);
  return from !== null && from <= date ? 'light' : 'normal';
}

/** How the whole week counts: "Rest of this week" makes the whole week a light week. */
export function weekKind(st: EngineState, ws: LocalDate): WeekType {
  if (isFloorWeek(st, ws)) return 'floor';
  return lightFrom(st, ws) !== null ? 'light' : 'normal';
}

/** Light or floor weeks strictly between two dates' weeks, or in `fromDate`'s own week. */
export function lightOrFloorWeekSince(st: EngineState, fromDate: LocalDate, toDate: LocalDate): boolean {
  const end = weekStart(toDate);
  for (let ws = weekStart(fromDate); ws < end; ws = addDays(ws, 7)) {
    if (weekKind(st, ws) !== 'normal') return true;
  }
  return false;
}

export function sickOn(st: EngineState, date: LocalDate): boolean {
  return st.sickPeriods.some((p) => p.from <= date && (p.to === null || date < p.to));
}

export function insideBreak(program: Program, date: LocalDate): Break | null {
  return maintenanceBreaks(program).find((b) => b.start <= date && date <= b.end) ?? null;
}

/** The next maintenance break that starts after `date`. */
export function nextBreakAfter(program: Program, date: LocalDate): Break | null {
  return maintenanceBreaks(program).find((b) => b.start > date) ?? null;
}
