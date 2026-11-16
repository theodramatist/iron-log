// Waist measurements (SPEC.md sections 4, 5.3, and 5.6, Q28): a tape check
// every two weeks, asked for at the end of a lifting session, so fat loss
// shows on the tape as well as the scale. No rule reads them.

import { addDays, READINGS, type AnyEvent, type LocalDate, type WaistEvent } from '../engine';

export interface WaistPoint {
  date: LocalDate;
  inches: number;
}

/** Where to put the tape, said the same way everywhere. */
export const WAIST_HOW =
  'Halfway between the bottom of your ribs and the top of your hip bones, after a normal breath out. Snug, not tight.';

/** One measurement a day, the one logged last, oldest day first. */
export function waistHistory(events: readonly AnyEvent[]): WaistPoint[] {
  const byDate = new Map<LocalDate, WaistEvent>();
  for (const e of events) {
    if (e.type !== 'waist') continue;
    const kept = byDate.get(e.date);
    if (!kept || e.createdAt >= kept.createdAt) byDate.set(e.date, e);
  }
  return [...byDate.values()]
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((e) => ({ date: e.date, inches: e.inches }));
}

/** The day the next check is due: today with none logged yet, then two weeks after the last. */
export function nextWaistCheck(events: readonly AnyEvent[], today: LocalDate): LocalDate {
  const last = waistHistory(events)
    .filter((p) => p.date <= today)
    .at(-1);
  return last ? addDays(last.date, READINGS.WAIST_CHECK_EVERY_DAYS) : today;
}

export function waistCheckDue(events: readonly AnyEvent[], today: LocalDate): boolean {
  return nextWaistCheck(events, today) <= today;
}

/** A tape reading in inches, or null if it isn't one. */
export function parseInches(text: string): number | null {
  const n = Number(text.trim().replace(',', '.'));
  return Number.isFinite(n) && n >= 20 && n <= 90 ? Math.round(n * 100) / 100 : null;
}
