// Warm-ups (RULES.md section 9).

import { floorPercent } from './plates';
import type { BarbellLiftId, Program } from './types';

export function warmupSets(
  lift: BarbellLiftId,
  workWeight: number,
  barLb: number,
  program: Program,
): { weight: number; reps: number }[] {
  const wu = program.warmups;
  const eq = program.equipment;
  let sets: { weight: number; reps: number }[];
  let last: number;
  if (lift === 'deadlift' && workWeight >= eq.deadliftWarmupStartWhenWorkAtLeastLb) {
    sets = [{ weight: eq.deadliftWarmupStartLb, reps: 5 }];
    last = eq.deadliftWarmupStartLb;
  } else {
    sets = wu.barSets.map((s) => ({ weight: barLb, reps: s.reps }));
    last = barLb;
  }
  wu.rampPercents.forEach((pct, i) => {
    const w = floorPercent(workWeight, pct, wu.roundToLb);
    if (w >= last + wu.minGapLb && w <= workWeight - wu.minGapLb) {
      sets.push({ weight: w, reps: wu.rampReps[i] ?? 5 });
      last = w;
    }
  });
  return sets;
}

/** The deadlift cue for empty-bar sets when the work weight is under 155. */
export function deadliftBlocksCue(workWeight: number, program: Program): string | null {
  return workWeight < program.equipment.deadliftWarmupStartWhenWorkAtLeastLb ? program.equipment.deadliftLightCue : null;
}
