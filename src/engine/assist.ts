// Chins and dips (RULES.md section 7).

import { READINGS } from './readings';
import type { AssistLiftId, AssistMovementLog, AssistState } from './types';

export function spreadReps(total: number, sets: number, cap: number): number[] {
  const t = Math.max(0, Math.min(total, sets * cap));
  const base = Math.floor(t / sets);
  const extra = t - base * sets;
  return Array.from({ length: sets }, (_, i) => (i < extra ? base + 1 : base));
}

export function initialAssist(lift: AssistLiftId, assistance: number, needsCalibration: boolean): AssistState {
  return {
    lift,
    needsCalibration,
    calibrationStart: null,
    assistance,
    step: 5,
    mode: assistance > 0 ? 'LOAD' : 'BODYWEIGHT',
    targetReps: 5,
    missStreak: 0,
    lastMadeAssistance: null,
    addedLoad: 0,
    lastTotalReps: null,
    lastSessionDate: null,
  };
}

export interface AssistCtx {
  twoPointFive: boolean;
  fiveLbSteps: boolean;
  stackStep: number;
}

/** Targets for each set in the movement's current mode. */
export function targetRepsFor(a: AssistState, sets: number): number[] {
  switch (a.mode) {
    case 'LOAD':
    case 'WEIGHTED':
      return Array.from({ length: sets }, () => 5);
    case 'REPS_BUILD':
      return Array.from({ length: sets }, () => a.targetReps);
    case 'BODYWEIGHT':
      return a.lastTotalReps === null ? Array.from({ length: sets }, () => 5) : spreadReps(a.lastTotalReps + 1, sets, 5);
  }
}

/** The calibrated setting becomes the assistance and its lastMadeAssistance. */
export function calibrateAssist(a: AssistState, setting: number): AssistState {
  return {
    ...a,
    needsCalibration: false,
    calibrationStart: null,
    assistance: setting,
    lastMadeAssistance: setting,
    mode: setting > 0 ? 'LOAD' : 'BODYWEIGHT',
    step: 5,
    targetReps: 5,
    missStreak: 0,
    addedLoad: 0,
    lastTotalReps: null,
  };
}

/** "More assistance": in BODYWEIGHT or WEIGHTED, come off the belt first, then add assistance in LOAD. */
export function addAssistance(a: AssistState, amount: number): AssistState {
  const s = { ...a };
  let more = amount;
  if (s.mode === 'WEIGHTED') {
    const take = Math.min(s.addedLoad, more);
    s.addedLoad -= take;
    more -= take;
    if (s.addedLoad > 0) return s;
    s.mode = 'BODYWEIGHT';
  }
  if (more <= 0) return s;
  if (s.mode === 'BODYWEIGHT') {
    s.mode = 'LOAD';
    s.assistance = more;
    s.targetReps = 5;
    s.lastTotalReps = null;
    return s;
  }
  s.assistance += more;
  return s;
}

function made(log: AssistMovementLog): boolean {
  return log.targetReps.length > 0 && log.targetReps.every((t, i) => (log.reps[i] ?? 0) >= t);
}

/** One heavy session's result, per the section 7 state machine. */
export function applyAssistResult(a: AssistState, log: AssistMovementLog, ctx: AssistCtx): AssistState {
  const s = { ...a };
  switch (s.mode) {
    case 'LOAD': {
      const A = log.assistance;
      const step = s.step === 5 && !ctx.fiveLbSteps && READINGS.NO_FIVE_LB_STEPS_USE_STACK_STEP ? ctx.stackStep : s.step;
      if (made(log) && (log.spare ?? 0) >= 1) {
        s.lastMadeAssistance = A;
        s.assistance = Math.max(0, A - step);
        s.missStreak = 0;
      } else if (made(log)) {
        s.lastMadeAssistance = A;
        s.missStreak = 0;
        s.assistance = ctx.twoPointFive ? Math.max(0, A - 2.5) : A;
      } else {
        s.missStreak += 1;
        s.assistance = A;
        if (s.step === 5 && ctx.twoPointFive) {
          s.step = 2.5;
        } else if (s.missStreak >= 2) {
          s.mode = 'REPS_BUILD';
          s.assistance = s.lastMadeAssistance ?? A;
          s.targetReps = 6;
        }
      }
      if (s.mode === 'LOAD' && s.assistance <= 0) {
        s.assistance = 0;
        s.mode = 'BODYWEIGHT';
        s.targetReps = 5;
        s.lastTotalReps = null;
      }
      return s;
    }
    case 'REPS_BUILD': {
      if (made(log)) {
        s.targetReps += 1;
        if (s.targetReps > 8) {
          s.assistance = Math.max(0, s.assistance - 5);
          s.targetReps = 5;
          s.missStreak = 0;
          s.mode = s.assistance === 0 ? 'BODYWEIGHT' : 'LOAD';
        }
      }
      return s;
    }
    case 'BODYWEIGHT': {
      const firstThree = log.reps.slice(0, 3);
      if (firstThree.length === 3 && firstThree.every((r) => r >= 5)) {
        s.mode = 'WEIGHTED';
        s.addedLoad = 2.5;
        s.lastTotalReps = null;
      } else {
        s.lastTotalReps = log.reps.reduce((sum, r) => sum + r, 0);
      }
      return s;
    }
    case 'WEIGHTED': {
      if (made(log)) s.addedLoad += 2.5;
      return s;
    }
  }
}
