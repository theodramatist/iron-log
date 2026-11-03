// Conditioning (RULES.md section 8).

import { weekKind, weekTypeOn } from './calendar';
import { addDays, daysBetween, weekdayIndex, weekStart } from './dates';
import type { ConditioningPlan } from './planTypes';
import { defaultTargetMinutes, firstWeekOfPhase, phaseDef } from './programAccess';
import { READINGS } from './readings';
import type { CondState, EngineState } from './state';
import type { EquipmentDown, LocalDate } from './types';

/** A calendar week counts when both sessions were completed and it was neither a light nor a floor week. */
export function weekCounted(st: EngineState, ws: LocalDate): boolean {
  const done = st.condSessions.filter((c) => c.counted && weekStart(c.date) === ws).length;
  return done >= st.program.schedule.maxConditioningSessionsPerWeek && weekKind(st, ws) === 'normal';
}

/** Move the conditioning-week count forward to the calendar week starting `targetWs`. */
export function advanceCond(st: EngineState, cond: CondState, targetWs: LocalDate): CondState {
  const c = { ...cond };
  if (c.weekStart === null) {
    c.weekStart = targetWs;
    return c;
  }
  while (c.weekStart < targetWs) {
    if (weekCounted(st, c.weekStart)) c.week += 1;
    c.weekStart = addDays(c.weekStart, 7);
  }
  return c;
}

/** More than 21 days since the last session drops a phase; more than 60 starts over. */
export function condLayoff(
  st: EngineState,
  cond: CondState,
  date: LocalDate,
): { cond: CondState; drop: 'none' | 'phase' | 'restart' } {
  if (!cond.lastCountedDate) return { cond, drop: 'none' };
  const gap = daysBetween(cond.lastCountedDate, date);
  const lay = st.program.conditioning.layoff;
  if (gap > lay.restartAfterDays) return { cond: { ...cond, week: 1 }, drop: 'restart' };
  if (gap > lay.dropOnePhaseAfterDays) {
    const phase = phaseDef(st.program, cond.week).phase;
    return { cond: { ...cond, week: firstWeekOfPhase(st.program, Math.max(1, phase - 1)) }, drop: 'phase' };
  }
  return { cond, drop: 'none' };
}

/** Thursday's session gets the intervals, or the week's second session if none have run yet. */
export function isIntervalDay(st: EngineState, date: LocalDate): boolean {
  if (weekdayIndex(date) === 3) return true;
  if (!READINGS.INTERVALS_ON_THURSDAY_OR_SECOND_SESSION) return false;
  const ws = weekStart(date);
  const earlier = st.condSessions.filter((c) => c.counted && weekStart(c.date) === ws && c.date <= date);
  return earlier.length === 1 && !earlier.some((c) => c.intervalsDone > 0);
}

export function conditioningPlan(
  st: EngineState,
  date: LocalDate,
  opts: { shortNight?: boolean; targetMinutes?: number; intervals?: number; equipmentDown?: EquipmentDown[] } = {},
): ConditioningPlan {
  const program = st.program;
  const c = program.conditioning;
  const advanced = advanceCond(st, st.cond, weekStart(date));
  const lay = condLayoff(st, advanced, date);
  const week = lay.cond.week;
  const ph = phaseDef(program, week);
  const min = c.minimumSessionMin;
  const target = Math.min(ph.range[1], Math.max(min, opts.targetMinutes ?? defaultTargetMinutes(program, week)));
  const weekType = weekTypeOn(st, date);

  let intervals = 0;
  let reason: string | null = null;
  if (ph.intervalsDefault > 0 && isIntervalDay(st, date)) {
    if (weekType === 'floor') reason = 'Floor week: no conditioning.';
    else if (weekType === 'light') reason = 'Light week: easy minutes only.';
    else if (opts.shortNight) reason = 'Last night was under 6 hours: easy minutes only.';
    else if (target < c.intervalsNeedAtLeastMin) reason = 'Intervals need a session of at least 30 minutes.';
    else {
      const def = st.flat.halveNext ? Math.floor(ph.intervalsDefault / 2) : ph.intervalsDefault;
      intervals = Math.max(0, Math.min(ph.intervalsMax, opts.intervals ?? def));
    }
  }

  const perInterval = c.interval.hardSec + c.interval.easySec;
  const layout =
    intervals > 0
      ? {
          easyBeforeSec: (target * 60 - intervals * perInterval) / 2,
          intervalBlockSec: intervals * perInterval,
          easyAfterSec: (target * 60 - intervals * perInterval) / 2,
        }
      : null;
  const down = opts.equipmentDown ?? [];
  const intervalsOnBike = down.includes('skiErg') || st.settings.skiErgToAirBike;

  return {
    date,
    conditioningWeek: week,
    phase: ph.phase,
    range: ph.range,
    minMinutes: min,
    targetMinutes: target,
    intervals,
    maxIntervals: ph.intervalsMax,
    noIntervalsReason: reason,
    layout,
    machines: {
      easy: down.includes('airBike') ? 'treadmill walk' : 'air bike',
      intervals: intervals > 0 ? (intervalsOnBike ? 'air bike' : 'SkiErg') : null,
    },
    screeningGate: intervals > 0 && !st.screening.intervals,
    layoffDrop: lay.drop,
  };
}
