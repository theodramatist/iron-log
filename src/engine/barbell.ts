// Barbell progression, the stall ladder, the section 6 counter, and
// missed-training drops (RULES.md sections 4, 5, 6, and 11).

import { insideBreak, nextBreakAfter } from './calendar';
import { daysBetween, programWeek } from './dates';
import { percentWeight, progressionWeight, type Inventory } from './plates';
import {
  bridgeRounds,
  cleanRowJumps,
  isTableLift,
  liftNoun,
  normalScheme,
  shortScheme,
  tableJump,
} from './programAccess';
import { READINGS } from './readings';
import type {
  AgeBracket,
  BarbellLiftId,
  EffortRating,
  LiftState,
  LocalDate,
  NextPrescription,
  Program,
  Suggestion,
  TableRating,
} from './types';

export type Outcome = 'made' | 'missed' | 'incomplete';

export interface LiftCtx {
  program: Program;
  inv: Inventory;
  date: LocalDate;
  foodLeverOn: boolean;
  addSuggestion: (s: Suggestion) => void;
}

const FIXED = { kind: 'fixed' } as const;

export function normalAt(program: Program, lift: BarbellLiftId, weight: number): NextPrescription {
  const n = normalScheme(program, lift);
  return { weight, sets: n.sets, reps: n.reps, scheme: 'normal' };
}

/** Short sets for the bridge or a hold; power cleans have none and repeat normal sets. */
export function shortAt(program: Program, lift: BarbellLiftId, weight: number): NextPrescription {
  const s = shortScheme(program, lift);
  return s ? { weight, sets: s.sets, reps: s.reps, scheme: 'short' } : normalAt(program, lift, weight);
}

export function pctWeight(ctx: { program: Program; inv: Inventory }, base: number, fraction: number, lift: BarbellLiftId) {
  return percentWeight(base, fraction, lift, ctx.inv, ctx.program.rounding.percentWeightsToLb);
}

function asTableRating(effort: EffortRating | null): TableRating {
  if (effort === 'light' || effort === 'rir3to4' || effort === 'rir1to2' || effort === 'grind') return effort;
  return READINGS.MISSING_RATING_IS_GRIND ? 'grind' : 'rir1to2';
}

/** Section 4, after a made heavy session at W. Returns the suggested jump. */
export function sectionFour(s: LiftState, W: number, effort: EffortRating | null, ladderStep: boolean, ctx: LiftCtx): number {
  const { program } = ctx;
  s.lcw = W;
  let jump: number;
  if (ladderStep) {
    jump = program.smallestJumpLb[s.lift];
    s.nextBasis = { kind: 'smallest', lcw: W };
  } else if (isTableLift(s.lift)) {
    const rating = asTableRating(effort);
    jump = tableJump(program, s.lift, rating);
    if (s.hasMissed) jump = Math.min(jump, program.maxJumpAfterAnyMissLb[s.lift]);
    s.nextBasis = { kind: 'table', rating, lcw: W };
  } else {
    if (effort === 'notCrisp') s.hasBeenNotCrisp = true;
    const j = cleanRowJumps(program, s.lift);
    const unrated = effort !== 'crisp' && effort !== 'notCrisp';
    jump = s.hasMissed || s.hasBeenNotCrisp || effort === 'notCrisp' || (unrated && READINGS.MISSING_RATING_IS_GRIND) ? j.after : j.crisp;
    s.nextBasis = { kind: 'cleanRow', lcw: W };
  }
  const { weight, note } = progressionWeight(W, jump, ctx.inv);
  s.next = normalAt(program, s.lift, weight);
  s.jumpNote = note;
  s.stage = 'NORMAL';
  s.round = 0;
  s.holdUntil = null;
  s.foodLeverRound = false;
  return jump;
}

export function reset(s: LiftState, W: number, date: LocalDate, ctx: Pick<LiftCtx, 'program' | 'inv'>): void {
  s.lastResetFrom = W;
  s.resetCount += 1;
  s.lastResetDate = date;
  s.lcw = pctWeight(ctx, W, ctx.program.stallLadder.resetFraction, s.lift);
  s.next = normalAt(ctx.program, s.lift, s.lcw);
  s.nextBasis = FIXED;
  s.jumpNote = null;
  s.stage = 'NORMAL';
  s.round = 0;
  s.holdUntil = null;
  s.foodLeverRound = false;
  s.pendingFoodLever = null;
}

function graduate(s: LiftState, ctx: LiftCtx): void {
  const { program } = ctx;
  const n = normalScheme(program, s.lift);
  const weight = s.lcw ?? s.lastHeavyWeight ?? 0;
  s.stage = 'GRADUATED';
  s.lastCompleted = { weight, sets: n.sets, reps: n.reps };
  s.next = normalAt(program, s.lift, weight);
  s.nextBasis = FIXED;
  s.round = 0;
  s.holdUntil = null;
  s.foodLeverRound = false;
  s.smallJumpCount = 0;
  s.smallJumpReachedOn = null;
  ctx.addSuggestion({
    kind: 'graduation',
    since: ctx.date,
    lift: s.lift,
    message: program.stallLadder.graduationMessage.replace('{lift}', liftNoun(program, s.lift)),
  });
}

/** beforeReset(W): the maintenance-break hold, then the food lever, then the reset. */
export function beforeReset(s: LiftState, W: number, ctx: LiftCtx): void {
  const { program, date } = ctx;
  const ladder = program.stallLadder;
  const brk = nextBreakAfter(program, date);
  const holdAllowed = !s.foodLeverRound || READINGS.HOLD_CHECK_AFTER_FOOD_LEVER_ROUND;
  if (holdAllowed && !insideBreak(program, date) && brk && daysBetween(date, brk.start) <= ladder.holdIfMaintenanceBreakWithinDays) {
    s.stage = 'HOLD';
    s.holdUntil = brk.start;
    s.round = 0;
    s.next = shortAt(program, s.lift, W);
    s.holdNextScheme = s.next.scheme;
    s.nextBasis = FIXED;
    s.jumpNote = null;
    return;
  }
  if (programWeek(date, program.athlete.startDate) <= ladder.foodLever.programWeeksMax && !ctx.foodLeverOn) {
    s.pendingFoodLever = { weight: W, date };
    ctx.addSuggestion({ kind: 'foodLever', since: date, lift: s.lift, message: ladder.foodLever.question });
    return;
  }
  reset(s, W, date, ctx);
}

function stall(s: LiftState, W: number, ctx: LiftCtx): void {
  const { program } = ctx;
  if (s.resetCount >= 1 && s.lastResetFrom !== null && W <= s.lastResetFrom) {
    graduate(s, ctx);
    return;
  }
  if (bridgeRounds(program, s.lift) === 0) {
    beforeReset(s, W, ctx);
    return;
  }
  s.stage = 'BRIDGE_SHORT';
  s.round = 1;
  s.next = shortAt(program, s.lift, W);
  s.nextBasis = FIXED;
  s.jumpNote = null;
  if (programWeek(ctx.date, program.athlete.startDate) <= program.stallLadder.earlyStallProgramWeeksMax) {
    ctx.addSuggestion({ kind: 'earlyStall', since: ctx.date, lift: s.lift, message: program.nutritionPrompts.earlyStallNote });
  }
}

/** The result of a heavy session (section 5), then the section 6 counter. */
export function applyHeavyResult(
  s: LiftState,
  outcome: 'made' | 'missed',
  W: number,
  effort: EffortRating | null,
  sessionScheme: 'normal' | 'short',
  ctx: LiftCtx,
): void {
  const { program } = ctx;
  const before = s.stage;
  const prevLcw = s.lcw;
  s.lastHeavyDate = ctx.date;
  s.lastHeavyWeight = W;
  s.lastEffort = outcome === 'missed' ? 'missed' : effort;
  s.overrideNext = null;
  let jump: number | null = null;

  switch (before) {
    case 'NORMAL':
      if (outcome === 'made') jump = sectionFour(s, W, effort, false, ctx);
      else {
        s.hasMissed = true;
        s.stage = 'REPEAT';
        s.next = normalAt(program, s.lift, W);
        s.nextBasis = FIXED;
        s.jumpNote = null;
      }
      break;
    case 'REPEAT':
      if (outcome === 'made') jump = sectionFour(s, W, effort, true, ctx);
      else if (s.foodLeverRound && s.lift === 'powerClean') reset(s, W, ctx.date, ctx);
      else stall(s, W, ctx);
      break;
    case 'BRIDGE_SHORT':
      if (outcome === 'made') {
        s.stage = 'BRIDGE_NORMAL';
        s.next = normalAt(program, s.lift, W);
        s.nextBasis = FIXED;
      } else beforeReset(s, W, ctx);
      break;
    case 'BRIDGE_NORMAL':
      if (outcome === 'made') jump = sectionFour(s, W, effort, true, ctx);
      else if (s.round < bridgeRounds(program, s.lift)) {
        s.stage = 'BRIDGE_SHORT';
        s.round += 1;
        s.next = shortAt(program, s.lift, W);
        s.nextBasis = FIXED;
      } else beforeReset(s, W, ctx);
      break;
    case 'HOLD': {
      const retry = s.holdUntil !== null && ctx.date >= s.holdUntil;
      if (retry) {
        if (outcome === 'made') jump = sectionFour(s, W, effort, true, ctx);
        else reset(s, W, ctx.date, ctx);
      } else if (outcome === 'made' && sessionScheme === 'normal') {
        jump = sectionFour(s, W, effort, true, ctx);
      } else {
        s.next = sessionScheme === 'short' ? normalAt(program, s.lift, W) : shortAt(program, s.lift, W);
        s.holdNextScheme = s.next.scheme;
      }
      break;
    }
    case 'GRADUATED':
      break;
  }

  if (outcome === 'made' && jump !== null) {
    const progressionStep = before === 'NORMAL' && (prevLcw === null || W > prevLcw);
    if (progressionStep || !READINGS.LIGHT_DAY_COUNT_ONLY_PROGRESSION_STEPS) {
      if (jump <= program.lightSquatDay.switchOnWhenSuggestedJumpAtMostLb) {
        s.smallJumpCount += 1;
        if (s.smallJumpCount >= program.lightSquatDay.switchOnAfterConsecutiveMadeHeavySessions && !s.smallJumpReachedOn) {
          s.smallJumpReachedOn = ctx.date;
        }
      } else {
        s.smallJumpCount = 0;
      }
    }
  }
}

/** "Has recovery felt poor?" Yes buys one more round; no resets. */
export function resolveFoodLever(s: LiftState, answer: boolean, ctx: Pick<LiftCtx, 'program' | 'inv'>): void {
  const pending = s.pendingFoodLever;
  if (!pending) return;
  s.pendingFoodLever = null;
  if (!answer) {
    reset(s, pending.weight, pending.date, ctx);
    return;
  }
  if (s.lift === 'powerClean') {
    s.stage = 'REPEAT';
    s.next = normalAt(ctx.program, s.lift, pending.weight);
  } else {
    s.stage = 'BRIDGE_SHORT';
    s.round = bridgeRounds(ctx.program, s.lift);
    s.next = shortAt(ctx.program, s.lift, pending.weight);
  }
  s.foodLeverRound = true;
  s.nextBasis = FIXED;
}

/** Section 11: the drop for `days` away, applied once at the first session back. */
export function applyLayoffBand(
  s: LiftState,
  days: number,
  ageBracket: AgeBracket,
  ctx: Pick<LiftCtx, 'program' | 'inv'>,
): void {
  if (s.lcw === null || days <= 5) return;
  const { program } = ctx;
  const bands = program.missedTraining.bands;
  if (days <= 7) {
    if (s.stage === 'NORMAL') {
      s.next = normalAt(program, s.lift, s.lcw);
      s.nextBasis = FIXED;
      s.jumpNote = null;
    }
    return;
  }
  const pre = s.lcw;
  const graduated = s.stage === 'GRADUATED';
  if (days <= 21) {
    const f = bands[2]?.fraction as { under40: number; '40plus': number };
    s.lcw = pctWeight(ctx, pre, ageBracket === 'under40' ? f.under40 : f['40plus'], s.lift);
    s.preLayoffLcw = null;
  } else if (days <= 60) {
    s.lcw = pctWeight(ctx, pre, bands[3]?.fraction as number, s.lift);
    s.preLayoffLcw = pre;
  } else {
    s.lcw = pctWeight(ctx, pre, (bands[4] as { defaultFraction: number }).defaultFraction, s.lift);
    s.preLayoffLcw = null;
    s.hasMissed = false;
    if (READINGS.FRESH_RUN_CLEARS_NOT_CRISP) s.hasBeenNotCrisp = false;
    s.resetCount = 0;
    s.lastResetFrom = null;
    s.lastResetDate = null;
    s.smallJumpCount = 0;
    s.smallJumpReachedOn = null;
    s.lastCompleted = null;
  }
  if (graduated && days <= 60 && READINGS.GRADUATED_SURVIVES_SHORT_LAYOFF) {
    // Section 17: a graduated lift stays graduated; only its prefill drops.
    s.lastCompleted = s.lastCompleted ? { ...s.lastCompleted, weight: s.lcw } : null;
    s.next = normalAt(program, s.lift, s.lcw);
    return;
  }
  s.stage = 'NORMAL';
  s.round = 0;
  s.holdUntil = null;
  s.foodLeverRound = false;
  s.pendingFoodLever = null;
  s.next = normalAt(program, s.lift, s.lcw);
  s.nextBasis = FIXED;
  s.jumpNote = null;
}

export function heavyWarmupWeight(s: LiftState, ctx: Pick<LiftCtx, 'program' | 'inv'>): number | null {
  if (s.preLayoffLcw === null) return null;
  const band = ctx.program.missedTraining.bands[3] as { ifLastWarmupHeavyFractionOfPreLayoffLcw: number };
  return pctWeight(ctx, s.preLayoffLcw, band.ifLastWarmupHeavyFractionOfPreLayoffLcw, s.lift);
}
