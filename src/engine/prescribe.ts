// The full plan for a lifting session (RULES.md section 16's order of operations).

import { addAssistance, targetRepsFor } from './assist';
import { heavyWarmupWeight, normalAt, pctWeight, resolveFoodLever } from './barbell';
import type { CalibratedLift } from './calibration';
import { lightOrFloorWeekSince, weekTypeOn } from './calendar';
import { conditioningPlan } from './conditioning';
import { addDays, daysBetween, programWeek, weekStart } from './dates';
import type {
  AssistBlockPlan,
  AssistMovementPlan,
  CalibrationPlan,
  LiftPlan,
  MissedBand,
  PausedLiftPlan,
  SessionPlan,
  WaitingLiftPlan,
} from './planTypes';
import { formatLb, inventoryFrom, platesPerSide, progressionWeight, type Inventory } from './plates';
import {
  BARBELL_LIFTS,
  liftLabel,
  liftNoun,
  normalScheme,
  phaseDef,
  reducedScheme,
  shiftRating,
  tableJump,
} from './programAccess';
import { READINGS } from './readings';
import { applyMissedTraining, applyOwnGap, lastSession } from './replay';
import { cloneAssist, cloneLifts, latestBodyweight, type EngineState } from './state';
import { projectedSessionMin, restDefaultSec } from './time';
import type {
  AssistLiftId,
  AssistState,
  BarbellLiftId,
  CheckIns,
  EquipmentDown,
  LiftState,
  LocalDate,
  NextPrescription,
  PrescriptionKind,
  WeekType,
  Workout,
} from './types';
import { deadliftBlocksCue, warmupSets } from './warmups';

export interface PrescribeOptions {
  checkIns?: CheckIns;
  painAnswers?: Partial<Record<BarbellLiftId, 'gone' | 'stillThere'>>;
  equipmentDown?: EquipmentDown[];
}

const CALIBRATED = new Set<BarbellLiftId>(['bench', 'row', 'powerClean']);

/** Q20: what a lift that still needs calibration shows in a light or floor week. */
export const WAITS_FOR_NORMAL_WEEK = 'Calibrates at its first session of a normal week.';

export function nextWorkout(st: EngineState): Workout {
  const last = lastSession(st);
  if (!last) return st.program.schedule.firstCompletedSession.workout as Workout;
  return last.workout === 'A' ? 'B' : 'A';
}

export function missedBand(daysAway: number | null): MissedBand | null {
  if (daysAway === null) return null;
  if (daysAway <= 5) return 'normal';
  if (daysAway <= 7) return 'repeat';
  if (daysAway <= 21) return 'drop';
  if (daysAway <= 60) return 'dropAskWarmup';
  return 'restartLight';
}

/** The once-a-week deadlift: on for good, from week 3 at the earliest (section 6). */
export function oncePerWeekActive(st: EngineState, s: LiftState, date: LocalDate): boolean {
  return (
    s.smallJumpReachedOn !== null &&
    date > s.smallJumpReachedOn &&
    programWeek(date, st.program.athlete.startDate) >= st.program.deadliftOncePerWeek.earliestProgramWeek &&
    s.stage !== 'GRADUATED'
  );
}

function heavyDeadliftThisWeek(st: EngineState, date: LocalDate): boolean {
  const ws = weekStart(date);
  return st.lifts.deadlift.history.some(
    (h) => h.kind === 'heavy' && (h.result === 'made' || h.result === 'missed') && weekStart(h.date) === ws && h.date <= date,
  );
}

export function slotLifts(
  st: EngineState,
  lifts: Record<BarbellLiftId, LiftState>,
  date: LocalDate,
  workout: Workout,
  weekType: WeekType,
): { slot: number; lift: BarbellLiftId }[] {
  const pull = st.settings.pullChoice;
  if (workout === 'A') {
    const onceOn = weekType !== 'light' && oncePerWeekActive(st, lifts.deadlift, date);
    const third: BarbellLiftId = onceOn && heavyDeadliftThisWeek(st, date) ? pull : 'deadlift';
    return [
      { slot: 1, lift: 'squat' },
      { slot: 2, lift: 'press' },
      { slot: 3, lift: third },
    ];
  }
  const third: BarbellLiftId = programWeek(date, st.program.athlete.startDate) <= 2 ? 'deadlift' : pull;
  return [
    { slot: 1, lift: 'squat' },
    { slot: 2, lift: 'bench' },
    { slot: 3, lift: third },
  ];
}

/** Section 6: the week's second session is light when a third can still follow it, by Friday. */
export function isLightSquatDay(st: EngineState, s: LiftState, date: LocalDate): boolean {
  if (weekTypeOn(st, date) !== 'normal') return false;
  if (!s.smallJumpReachedOn || date <= s.smallJumpReachedOn || s.stage === 'GRADUATED') return false;
  const ws = weekStart(date);
  const done = st.sessions.filter((r) => weekStart(r.date) === ws && r.date <= date).length;
  if (done !== 1) return false;
  return addDays(date, 2) <= addDays(ws, 4) && done + 1 < st.program.schedule.maxLiftingSessionsPerWeek;
}

/** The heavy prescription from the lift's stage, then the after-light-week repeat and the short night. */
function heavyNext(
  st: EngineState,
  s: LiftState,
  date: LocalDate,
  opts: PrescribeOptions,
  inv: Inventory,
): NextPrescription & { fromJump: boolean } {
  const program = st.program;
  const n = normalScheme(program, s.lift);
  if (s.overrideNext) {
    return {
      weight: s.overrideNext.weight,
      sets: s.overrideNext.sets ?? n.sets,
      reps: s.overrideNext.reps ?? n.reps,
      scheme: 'normal',
      fromJump: false,
    };
  }
  let next = s.next ?? normalAt(program, s.lift, s.lcw ?? st.settings.barLb);
  if (s.stage === 'HOLD' && s.holdUntil !== null && date >= s.holdUntil) next = normalAt(program, s.lift, next.weight);
  if (
    s.stage === 'NORMAL' &&
    s.lcw !== null &&
    s.nextBasis.kind !== 'fixed' &&
    s.lastHeavyDate !== null &&
    lightOrFloorWeekSince(st, s.lastHeavyDate, date)
  ) {
    return { ...normalAt(program, s.lift, s.lcw), fromJump: false };
  }
  if (opts.checkIns?.lastNightUnder6 && s.stage === 'NORMAL') {
    const b = s.nextBasis;
    let w: number | null = null;
    if (b.kind === 'table') {
      let jump = tableJump(program, s.lift, shiftRating(program, b.rating));
      if (s.hasMissed) jump = Math.min(jump, program.maxJumpAfterAnyMissLb[s.lift]);
      w = progressionWeight(b.lcw, jump, inv).weight;
    } else if (b.kind === 'cleanRow') {
      w = progressionWeight(b.lcw, program.shortNightRowShift.cleanRowJumpLb, inv).weight;
    }
    if (w !== null && w < next.weight) next = { ...next, weight: w };
  }
  return { ...next, fromJump: s.nextBasis.kind !== 'fixed' };
}

function stageLabel(s: LiftState, weight: number, sets: number, reps: number): string | null {
  const scheme = `${sets}×${reps} at ${formatLb(weight)}`;
  switch (s.stage) {
    case 'REPEAT':
      return `Repeat: ${scheme}`;
    case 'BRIDGE_SHORT':
    case 'BRIDGE_NORMAL':
      return `Bridge: ${scheme}`;
    case 'HOLD':
      return `Hold: ${scheme} until the maintenance break`;
    case 'GRADUATED':
      return 'Novice run over: log what you do';
    default:
      return null;
  }
}

function buildLiftPlan(
  st: EngineState,
  s: LiftState,
  slot: number,
  date: LocalDate,
  weekType: WeekType,
  opts: PrescribeOptions,
  returning: boolean,
): LiftPlan {
  const program = st.program;
  const settings = st.settings;
  const inv = inventoryFrom(settings);
  const ctx = { program, inv };
  const lift = s.lift;
  const n = normalScheme(program, lift);
  const base = s.lcw ?? s.next?.weight ?? settings.barLb;
  const notes: string[] = [];
  const cues: string[] = [];
  let kind: PrescriptionKind;
  let weight: number;
  let sets = n.sets;
  let reps = n.reps;
  let scheme: 'normal' | 'short' = 'normal';
  let calibration: CalibrationPlan | null = null;

  if (returning) {
    kind = 'painReturn';
    weight = pctWeight(ctx, base, program.safety.painReturnFraction, lift);
    if (weekType !== 'normal' && READINGS.PAIN_RETURN_TAKES_WEEK_SETS) {
      // Q21: inside a light or floor week, the return takes that week's sets.
      const r = reducedScheme(program, lift, weekType === 'floor' ? 'floorWeek' : 'lightWeek');
      sets = r.sets;
      reps = r.reps;
    }
    notes.push(`Return session at ${Math.round(program.safety.painReturnFraction * 100)}%.`);
  } else if (s.needsCalibration && CALIBRATED.has(lift)) {
    const c = program.calibration[lift as CalibratedLift];
    kind = 'calibration';
    weight = settings.barLb;
    reps = c.repsPerSet;
    calibration = {
      repsPerSet: c.repsPerSet,
      startWeight: settings.barLb,
      stepFast: c.stepLbFast,
      stepSlowing: c.stepLbSlowing,
      buttons: [...c.buttons],
      workSets: n.sets,
    };
  } else if (weekType === 'floor') {
    const r = reducedScheme(program, lift, 'floorWeek');
    kind = 'floor';
    weight = base;
    sets = r.sets;
    reps = r.reps;
  } else if (weekType === 'light') {
    const r = reducedScheme(program, lift, 'lightWeek');
    kind = 'lightWeek';
    weight = pctWeight(ctx, base, program.deload.lightWeek.fractionOfLcw, lift);
    sets = r.sets;
    reps = r.reps;
  } else if (s.stage === 'GRADUATED') {
    // The prefill: the last completed weight and sets, or a layoff's drop from them.
    const prefill = s.next ?? s.lastCompleted ?? { weight: base, sets: n.sets, reps: n.reps };
    kind = 'graduated';
    weight = prefill.weight;
    sets = prefill.sets;
    reps = prefill.reps;
  } else if (lift === 'squat' && isLightSquatDay(st, s, date)) {
    const ld = program.lightSquatDay;
    kind = 'lightDay';
    weight = pctWeight(ctx, s.lastHeavyWeight ?? base, ld.fractionOfMostRecentHeavySquat, 'squat');
    sets = ld.sets;
    reps = ld.reps;
  } else {
    kind = 'heavy';
    const next = heavyNext(st, s, date, opts, inv);
    weight = next.weight;
    sets = next.sets;
    reps = next.reps;
    scheme = next.scheme;
    if (s.jumpNote && next.fromJump) notes.push(s.jumpNote);
  }

  if (lift === 'deadlift' && kind !== 'calibration') {
    const cue = deadliftBlocksCue(weight, program);
    if (cue) cues.push(cue);
  }

  const warmups =
    kind === 'calibration'
      ? []
      : warmupSets(lift, weight, settings.barLb, program).map((w) => ({ ...w, plates: platesPerSide(w.weight, inv) ?? [] }));

  return {
    slot,
    lift,
    label: liftLabel(program, lift),
    kind,
    weight,
    sets,
    reps,
    plates: platesPerSide(weight, inv) ?? [],
    warmups,
    stage: s.stage,
    round: s.round,
    stageLabel: kind === 'heavy' || kind === 'graduated' ? stageLabel(s, weight, sets, reps) : null,
    restSec: restDefaultSec(kind === 'heavy' ? s.lastEffort : s.lastEffort ?? null, { shortSets: scheme === 'short' }, program),
    cues,
    notes,
    layoffHeavyWeight: kind === 'heavy' ? heavyWarmupWeight(s, ctx) : null,
    calibration,
  };
}

/**
 * program.json words the calibration for dips on day one. After a long layoff
 * both movements start at a set number (section 11), and chins have no
 * upper-arms-parallel depth cue.
 */
export function calibrationText(dipText: string, lift: AssistLiftId, start: number, recalibrating: boolean): string {
  if (lift === 'dip' && !recalibrating) return dipText;
  const steps = dipText.slice(dipText.indexOf('. ') + 2);
  const body = lift === 'chin' ? steps.replace(/, stopping at upper arms parallel\.$/, '.') : steps;
  return `Start at ${formatLb(start)} lb of help. ${body}`;
}

function buildAssistMovement(
  st: EngineState,
  assist: Record<AssistLiftId, AssistState>,
  lift: AssistLiftId,
  date: LocalDate,
  workout: Workout,
  weekType: WeekType,
): AssistMovementPlan {
  const program = st.program;
  const ap = program.assistance;
  const a = assist[lift];
  const kind = weekType === 'light' ? 'lightWeek' : 'heavy';
  const sets = kind === 'lightWeek' ? ap.lightWeekRounds : ap.sets;
  let view: AssistState = a;
  let calibration: AssistMovementPlan['calibration'] = null;
  if (a.needsCalibration) {
    const chin = assist.chin;
    const chinNow = chin.mode === 'LOAD' || chin.mode === 'REPS_BUILD' ? chin.assistance : 0;
    const start = a.calibrationStart ?? (lift === 'dip' ? chinNow : a.assistance);
    calibration = { start, step: 10, closeStep: 5, instructions: calibrationText(ap.calibration.dip, lift, start, a.calibrationStart !== null) };
    view = { ...a, assistance: start, mode: 'LOAD', addedLoad: 0 };
  } else if (kind === 'lightWeek') {
    view = addAssistance(a, ap.lightWeekExtraLb);
  }
  const bw = latestBodyweight(st, date);
  const neg = ap.negatives;
  const chinDay = st.settings.splitChinsDips || workout === neg.onWorkout;
  const negatives =
    lift === 'chin' &&
    kind === 'heavy' &&
    !a.needsCalibration &&
    view.assistance > neg.whenAssistanceAboveLb &&
    view.assistance <= neg.whenAssistanceAtMostLb &&
    chinDay
      ? neg.reps
      : 0;
  const cues = [`Lower each rep over about ${ap.eccentricSeconds} seconds.`];
  if (lift === 'dip') {
    const pw = programWeek(date, program.athlete.startDate);
    cues.push(pw <= ap.dipDepthCue.throughProgramWeek ? ap.dipDepthCue.early : ap.dipDepthCue.later);
  }
  return {
    lift,
    label: program.lifts[lift].label,
    kind,
    mode: view.mode,
    assistance: view.assistance,
    addedLoad: view.addedLoad,
    targetReps: targetRepsFor(view, sets),
    effectiveLoad: bw ? bw.lb - view.assistance + view.addedLoad : null,
    bodyweightLb: bw?.lb ?? null,
    bodyweightDate: bw?.date ?? null,
    bodyweightStale: bw ? daysBetween(bw.date, date) > 14 : false,
    negatives,
    cues,
    calibration,
  };
}

export function buildSessionPlan(st: EngineState, date: LocalDate, opts: PrescribeOptions = {}): SessionPlan {
  const program = st.program;
  const settings = st.settings;
  const inv = inventoryFrom(settings);
  const weekType = weekTypeOn(st, date);
  const pw = programWeek(date, program.athlete.startDate);
  const prev = lastSession(st);
  const daysAway = prev ? daysBetween(prev.date, date) : null;

  // Steps 1 to 3: week type, missed training, check-ins and pain.
  const lifts = cloneLifts(st.lifts);
  const assist = cloneAssist(st.assist);
  applyMissedTraining(st, lifts, assist, daysAway);
  for (const lift of BARBELL_LIFTS) {
    const s = lifts[lift];
    if (READINGS.UNANSWERED_FOOD_LEVER_IS_NO && s.pendingFoodLever && s.pendingFoodLever.date < date) {
      resolveFoodLever(s, false, { program, inv });
    }
  }
  for (const lift of opts.checkIns?.jointPain ?? []) lifts[lift] = { ...lifts[lift], pain: 'paused' };

  // Steps 4 to 6: prescriptions, slot changes, rounding, plates, and warm-ups.
  const workout = nextWorkout(st);
  const planned: LiftPlan[] = [];
  const paused: PausedLiftPlan[] = [];
  const waiting: WaitingLiftPlan[] = [];
  for (const { slot, lift } of slotLifts(st, lifts, date, workout, weekType)) {
    const s = lifts[lift];
    if (READINGS.CALIBRATION_WAITS_FOR_NORMAL_WEEK && weekType !== 'normal' && s.needsCalibration && CALIBRATED.has(lift)) {
      waiting.push({ slot, lift, label: liftLabel(program, lift), message: WAITS_FOR_NORMAL_WEEK });
      continue;
    }
    const answer = opts.painAnswers?.[lift];
    if (s.pain === 'paused' && answer !== 'gone') {
      paused.push({
        slot,
        lift,
        label: liftLabel(program, lift),
        message: answer === 'stillThere' ? program.safety.pausedLiftStillThere : 'Paused after a pain stop.',
        question: program.safety.pausedLiftQuestion.replace('{lift}', liftNoun(program, lift)),
      });
      continue;
    }
    if (s.pain !== 'none') applyOwnGap(st, s, date);
    planned.push(buildLiftPlan(st, s, slot, date, weekType, opts, s.pain !== 'none'));
  }

  let assistBlock: AssistBlockPlan | null = null;
  if (weekType !== 'floor') {
    const rounds = weekType === 'light' ? program.assistance.lightWeekRounds : program.assistance.sets;
    const restSec = restDefaultSec(null, { assistBlock: true }, program);
    if (opts.equipmentDown?.includes('assistMachine')) {
      assistBlock = {
        rounds,
        restSec,
        chin: null,
        dip: null,
        substitutions: program.workouts.substitutions.assistMachineDown.map((x) => ({
          exercise: x.exercise,
          sets: x.sets,
          reps: x.reps,
          repsToSpare: x.repsToSpare,
          replaces: x.replaces as AssistLiftId,
        })),
      };
    } else {
      const split = settings.splitChinsDips;
      const days = program.workouts.splitChinsDipsWhenAchy;
      assistBlock = {
        rounds,
        restSec,
        chin: !split || workout === days.chin ? buildAssistMovement(st, assist, 'chin', date, workout, weekType) : null,
        dip: !split || workout === days.dip ? buildAssistMovement(st, assist, 'dip', date, workout, weekType) : null,
        substitutions: null,
      };
    }
  }

  const n = program.nutritionPrompts;
  const foodLines = [n.liftingDay, ...(st.foodLever.on ? [n.foodLeverOnLiftingDay] : [])];
  const notes = program.safety.sorenessNoteProgramWeeks.includes(pw) ? [program.safety.sorenessNote] : [];
  const askFlat = st.flat.askPending;
  const start = program.checkIns.liftingStart.map((c) => ({ ...c }));
  if (askFlat) start.push({ ...program.checkIns.afterIntervals });

  const plan: SessionPlan = {
    date,
    workout,
    weekType,
    programWeek: pw,
    daysAway,
    missedBand: missedBand(daysAway),
    lifts: planned,
    paused,
    waiting,
    assist: assistBlock,
    beforeLifting: program.workouts.beforeLifting,
    afterLiftingSpin: null,
    checkIns: { start, end: program.checkIns.liftingEnd.map((c) => ({ ...c })) },
    askFlatFromIntervals: askFlat,
    pendingQuestions: BARBELL_LIFTS.filter((l) => lifts[l].pendingFoodLever).map((l) => ({
      kind: 'foodLever' as const,
      lift: l,
      question: program.stallLadder.foodLever.question,
    })),
    notes,
    foodLines,
    needsConsecutiveConfirm: st.sessions.some((r) => r.date === addDays(date, -1)),
    sameDayWarning: st.sessions.some((r) => r.date === date),
  };

  // Section 2: the optional spin, only if the session still ends inside 80 minutes.
  const phase = phaseDef(program, conditioningPlan(st, date).conditioningWeek);
  if (phase.afterLiftMin > 0 && weekType !== 'floor') {
    const withSpin = { ...plan, afterLiftingSpin: { minutes: phase.afterLiftMin, optional: true } };
    if (projectedSessionMin(withSpin) <= program.schedule.maxSessionMinutes) return withSpin;
  }
  return plan;
}
