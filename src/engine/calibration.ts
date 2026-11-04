// Calibration (RULES.md section 9): bench, rows, and cleans ramp from the
// empty bar until the bar slows; dips step assistance down until 5 solid
// reps leave 2 or 3 to spare.

import type { CalibrationSetLog, Program } from './types';

export type CalibratedLift = 'bench' | 'row' | 'powerClean';

export function calibrationNextWeight(
  prev: number,
  verdict: 'fast' | 'slowing',
  lift: CalibratedLift,
  program: Program,
): number {
  const c = program.calibration[lift];
  return prev + (verdict === 'fast' ? c.stepLbFast : c.stepLbSlowing);
}

/**
 * The set that clearly slowed is the work weight and the first work set. If
 * it missed reps, the set before it is the work weight, with fresh work sets.
 */
export function calibrationOutcome(
  sets: CalibrationSetLog[],
  lift: CalibratedLift,
  program: Program,
): CalibrationResult | null {
  return rampResult(sets, program.calibration[lift].repsPerSet, program.lifts[lift].workSets);
}

export interface CalibrationResult {
  workWeight: number;
  rampSetIsFirstWorkSet: boolean;
  workSetsRemaining: number;
}

/** The same, from a session plan's own numbers (`CalibrationPlan.repsPerSet` and `workSets`). */
export function rampResult(sets: readonly CalibrationSetLog[], repsPerSet: number, workSets: number): CalibrationResult | null {
  const i = sets.findIndex((s) => s.verdict === 'slowed');
  if (i < 0) return null;
  const last = sets[i]!;
  if (last.reps >= repsPerSet) {
    return { workWeight: last.weight, rampSetIsFirstWorkSet: true, workSetsRemaining: workSets - 1 };
  }
  const prev = sets[i - 1];
  return { workWeight: prev ? prev.weight : last.weight, rampSetIsFirstWorkSet: false, workSetsRemaining: workSets };
}

/** Take 10 lb off each set, or 5 lb once it feels close. */
export function dipCalibrationNext(prevAssistance: number, close: boolean): number {
  return Math.max(0, prevAssistance - (close ? 5 : 10));
}
