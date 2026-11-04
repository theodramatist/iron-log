// Time budget and rest timer (RULES.md section 14).

import type { LiftPlan, SessionPlan } from './planTypes';
import { READINGS } from './readings';
import type { BarbellLiftId, EffortRating, IsoTimestamp, Program } from './types';

export interface TimerState {
  startedAt: IsoTimestamp;
  durationSec: number;
  /** Net seconds added with the plus and minus buttons. */
  adjustSec: number;
}

/** Remaining rest from stored timestamps, so it stays right after the app is backgrounded. */
export function timerRemainingSec(timer: TimerState, nowIso: IsoTimestamp): number {
  const elapsed = (Date.parse(nowIso) - Date.parse(timer.startedAt)) / 1000;
  return Math.max(0, Math.round(timer.durationSec + timer.adjustSec - elapsed));
}

export function restDefaultSec(
  lastEffort: EffortRating | null,
  opts: { shortSets?: boolean; assistBlock?: boolean },
  program: Program,
): number {
  const r = program.timeBudget.restDefaultsSec;
  if (opts.assistBlock) return r.chinDipBlock;
  let sec: number;
  switch (lastEffort) {
    case 'light':
      sec = r.light;
      break;
    case 'rir3to4':
      sec = r.rir3to4;
      break;
    case 'rir1to2':
      sec = r.rir1to2;
      break;
    case 'grind':
      sec = r.grind;
      break;
    case 'missed':
      sec = r.missed;
      break;
    case 'crisp':
      sec = READINGS.REST_CRISP_SEC;
      break;
    case 'notCrisp':
      sec = READINGS.REST_NOT_CRISP_SEC;
      break;
    default:
      sec = r.noHistory;
  }
  return opts.shortSets ? Math.max(sec, r.shortSetsMin) : sec;
}

export interface SessionProgress {
  bikeDone: boolean;
  warmupsDone: Partial<Record<BarbellLiftId, number>>;
  workSetsDone: Partial<Record<BarbellLiftId, number>>;
  assistSetsDone: number;
  spinDone: boolean;
}

/** Step 2 drops the second empty-bar set, or the deadlift's lowest ramp set when it has two or more. */
function hasDroppableWarmup(l: LiftPlan): boolean {
  const w = l.warmups;
  const startsWithTwoBarSets = w.length >= 2 && w[0]!.weight === w[1]!.weight;
  // A deadlift that starts at 135 drops its lowest ramp set when it has two or more.
  if (l.lift === 'deadlift' && !startsWithTwoBarSets) return w.length - 1 >= 2;
  return startsWithTwoBarSets;
}

function remainingSec(plan: SessionPlan, p: SessionProgress, cuts: number): number {
  const R = READINGS;
  let t = p.bikeDone ? 0 : R.BIKE_WARMUP_SEC;
  const pressOrBench = plan.lifts.some((l) => l.lift === 'press' || l.lift === 'bench');
  plan.lifts.forEach((l, i) => {
    const doneSets = p.workSetsDone[l.lift] ?? 0;
    let warmLeft = Math.max(0, l.warmups.length - (p.warmupsDone[l.lift] ?? 0));
    if (cuts >= 2 && warmLeft > 0 && hasDroppableWarmup(l)) warmLeft -= 1;
    const setsLeft = Math.max(0, l.sets - doneSets);
    let rest = l.restSec;
    if (cuts >= 3 && (l.lift === 'press' || l.lift === 'bench')) rest = Math.max(rest, R.CHINS_BETWEEN_PRESS_MIN_REST_SEC);
    const gaps = Math.max(0, doneSets > 0 ? setsLeft : setsLeft - 1);
    t += warmLeft * R.WARMUP_SET_SEC + setsLeft * R.WORK_SET_SEC + gaps * rest;
    if (i > 0 && (setsLeft > 0 || warmLeft > 0)) t += R.LIFT_CHANGE_SEC;
  });
  if (plan.assist) {
    const a = plan.assist;
    const movements = (a.chin ? 1 : 0) + (a.dip ? 1 : 0) + (a.substitutions?.length ?? 0);
    let left = Math.max(0, a.rounds * movements - p.assistSetsDone);
    if (cuts >= 3 && a.chin && pressOrBench) left = Math.max(0, left - a.rounds);
    t += left * R.ASSIST_SET_SEC + Math.max(0, left - 1) * a.restSec;
  }
  if (plan.afterLiftingSpin && !p.spinDone && cuts < 1) t += R.SPIN_SEC;
  return t;
}

/** Projected minutes for a whole fresh session, spin included. */
export function projectedSessionMin(plan: SessionPlan): number {
  return remainingSec(
    plan,
    { bikeDone: false, warmupsDone: {}, workSetsDone: {}, assistSetsDone: 0, spinDone: false },
    0,
  ) / 60;
}

/**
 * Section 14: over 80 projected minutes, show the cut order one step at a
 * time. Steps that would save nothing are skipped. No step touches squat or
 * deadlift rests.
 */
export function timeGuard(
  plan: SessionPlan,
  progress: SessionProgress,
  elapsedSec: number,
  cutsApplied: number,
  program: Program,
): { projectedMin: number; nextCut: 1 | 2 | 3 | null; nextCutText: string | null; projectedAfterNextCutMin: number | null } {
  const projectedMin = (elapsedSec + remainingSec(plan, progress, cutsApplied)) / 60;
  let nextCut: 1 | 2 | 3 | null = null;
  if (projectedMin > program.schedule.maxSessionMinutes) {
    for (let step = cutsApplied + 1; step <= 3; step++) {
      if (remainingSec(plan, progress, step) < remainingSec(plan, progress, step - 1)) {
        nextCut = step as 1 | 2 | 3;
        break;
      }
    }
  }
  return {
    projectedMin,
    nextCut,
    nextCutText: nextCut ? (program.timeBudget.cutOrder[nextCut - 1] ?? null) : null,
    projectedAfterNextCutMin: nextCut ? (elapsedSec + remainingSec(plan, progress, nextCut)) / 60 : null,
  };
}
