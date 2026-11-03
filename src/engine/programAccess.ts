// Typed access to program.json constants. RULES.md says how they are used.

import type { BarbellLiftId, Program, TableRating } from './types';

export const BARBELL_LIFTS: readonly BarbellLiftId[] = ['squat', 'press', 'bench', 'deadlift', 'powerClean', 'row'];
export const TABLE_LIFTS: readonly BarbellLiftId[] = ['squat', 'press', 'bench', 'deadlift'];
export const CLEAN_ROW_LIFTS: readonly BarbellLiftId[] = ['powerClean', 'row'];

export const isTableLift = (lift: BarbellLiftId): boolean => TABLE_LIFTS.includes(lift);

export function liftLabel(program: Program, lift: keyof Program['lifts']): string {
  return program.lifts[lift].label;
}

/** "the squat", "the bench press": the label as it reads mid-sentence. */
export function liftNoun(program: Program, lift: keyof Program['lifts']): string {
  return liftLabel(program, lift).toLowerCase();
}

export function normalScheme(program: Program, lift: BarbellLiftId): { sets: number; reps: number } {
  const l = program.lifts[lift];
  return { sets: l.workSets, reps: l.reps };
}

export function shortScheme(program: Program, lift: BarbellLiftId): { sets: number; reps: number } | null {
  return program.stallLadder.bridgeShortSets[lift] ?? null;
}

export function bridgeRounds(program: Program, lift: BarbellLiftId): number {
  return program.stallLadder.bridgeRounds[lift];
}

export function tableJump(program: Program, lift: BarbellLiftId, rating: TableRating): number {
  const table = program.jumpTableLb[lift] as Partial<Record<TableRating, number>>;
  return table[rating] ?? program.smallestJumpLb[lift];
}

export function cleanRowJumps(program: Program, lift: BarbellLiftId): { crisp: number; after: number } {
  const t = program.jumpTableLb[lift] as { crisp?: number; afterAnyNotCrispOrMiss?: number };
  return { crisp: t.crisp ?? 5, after: t.afterAnyNotCrispOrMiss ?? 2.5 };
}

export function shiftRating(program: Program, rating: TableRating): TableRating {
  const shift = program.shortNightRowShift as unknown as Record<TableRating, TableRating>;
  return shift[rating];
}

/** Light-week and floor-week schemes: 3x5 to 2x5, 1x5 stays, 5x3 to 3x3. */
export function reducedScheme(
  program: Program,
  lift: BarbellLiftId,
  which: 'lightWeek' | 'floorWeek',
): { sets: number; reps: number } {
  const n = normalScheme(program, lift);
  const table = program.deload[which].sets as Record<string, { sets: number; reps: number }>;
  return table[`${n.sets}x${n.reps}`] ?? n;
}

export interface PhaseDef {
  phase: number;
  fromWeek: number;
  toWeek: number | null;
  range: [number, number];
  intervalsDefault: number;
  intervalsMax: number;
  afterLiftMin: number;
}

export function phases(program: Program): PhaseDef[] {
  return program.conditioning.phases.map((p) => {
    const raw = p as {
      phase: number;
      fromWeek: number;
      toWeek: number | null;
      tueEasyMin: number[];
      thuIntervals: number | number[];
      thuIntervalsDefault?: number;
      afterLiftMin: number;
    };
    const iv = raw.thuIntervals;
    const max = Array.isArray(iv) ? Math.max(...iv) : iv;
    const def = raw.thuIntervalsDefault ?? (Array.isArray(iv) ? Math.min(...iv) : iv);
    return {
      phase: raw.phase,
      fromWeek: raw.fromWeek,
      toWeek: raw.toWeek,
      range: [raw.tueEasyMin[0] ?? 20, raw.tueEasyMin[1] ?? 30],
      intervalsDefault: def,
      intervalsMax: max,
      afterLiftMin: raw.afterLiftMin,
    };
  });
}

export function phaseDef(program: Program, conditioningWeek: number): PhaseDef {
  const all = phases(program);
  const hit = all.find((p) => conditioningWeek >= p.fromWeek && (p.toWeek === null || conditioningWeek <= p.toWeek));
  return hit ?? all[all.length - 1]!;
}

export function firstWeekOfPhase(program: Program, phase: number): number {
  return phases(program).find((p) => p.phase === phase)?.fromWeek ?? 1;
}

export function defaultTargetMinutes(program: Program, conditioningWeek: number): number {
  const list = program.conditioning.defaultTargetMinByConditioningWeek;
  return list[conditioningWeek - 1] ?? program.conditioning.defaultTargetMinAfterListEnds;
}

export interface Break {
  start: string;
  end: string;
}

export function maintenanceBreaks(program: Program): Break[] {
  return program.nutritionPrompts.maintenanceBreaks.computed;
}
