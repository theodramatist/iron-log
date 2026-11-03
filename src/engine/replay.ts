// Replay: fold the event log, in date order, into engine state.
// Editing or deleting a past entry just replays (RULES.md introduction).

import { addAssistance, applyAssistResult, calibrateAssist, type AssistCtx } from './assist';
import {
  applyHeavyResult,
  applyLayoffBand,
  normalAt,
  pctWeight,
  resolveFoodLever,
  type LiftCtx,
  type Outcome,
} from './barbell';
import { calibrationOutcome, type CalibratedLift } from './calibration';
import { weekTypeOn } from './calendar';
import { advanceCond, condLayoff } from './conditioning';
import { addDays, daysBetween, weekStart } from './dates';
import { inventoryFrom } from './plates';
import { BARBELL_LIFTS, shortScheme } from './programAccess';
import { READINGS } from './readings';
import { defaultSettings, initialState, type EngineState } from './state';
import type {
  AgeBracket,
  AnyEvent,
  AssistState,
  ConditioningSessionEvent,
  EngineInput,
  LiftLog,
  LiftState,
  LiftingSessionEvent,
  LocalDate,
  OverrideEvent,
  Settings,
  SetupEvent,
  Suggestion,
} from './types';

export function sortEvents(events: AnyEvent[]): AnyEvent[] {
  return [...events].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** State after every event dated on or before `through` (all events when omitted). */
export function replay(input: EngineInput, through?: LocalDate): EngineState {
  const st = initialState(input.program, defaultSettings(input.program));
  const events = sortEvents(input.events);
  for (const ev of events) if (ev.type === 'setup') applySetup(st, ev);
  const overrides = Object.fromEntries(Object.entries(input.settings).filter(([, v]) => v !== undefined));
  st.settings = { ...st.settings, ...overrides } as Settings;
  for (const ev of events) {
    if (ev.type === 'setup') continue;
    if (through !== undefined && ev.date > through) break;
    applyEvent(st, ev);
  }
  return st;
}

// ------------------------------------------------------------ helpers

export function liftCtx(st: EngineState, date: LocalDate): LiftCtx {
  return {
    program: st.program,
    inv: inventoryFrom(st.settings),
    date,
    foodLeverOn: st.foodLever.on,
    addSuggestion: (s) => addSuggestion(st, s),
  };
}

export function assistCtx(st: EngineState): AssistCtx {
  return {
    twoPointFive: st.settings.assistTwoPointFiveLbSteps,
    fiveLbSteps: st.settings.assistFiveLbSteps,
    stackStep: st.program.equipment.assistMachine.stackStepLb,
  };
}

function addSuggestion(st: EngineState, s: Suggestion): void {
  st.suggestions = st.suggestions.filter((x) => !(x.kind === s.kind && x.lift === s.lift));
  st.suggestions.push(s);
}

export function ageBracketOf(st: EngineState): AgeBracket {
  return st.settings.ageBracket ?? (st.program.athlete.ageBracketIfUnset as AgeBracket);
}

export function lastSession(st: EngineState) {
  return st.sessions[st.sessions.length - 1] ?? null;
}

/** Made, missed, or incomplete (RULES.md sections 0 and 4). */
export function evaluate(log: LiftLog): Outcome {
  if (log.notReached) return 'incomplete';
  const attempted = log.sets.filter((s) => !s.skipped);
  if (attempted.length === 0) return 'incomplete';
  if (attempted.some((s) => s.reps < log.prescription.reps || s.formBroke)) return 'missed';
  if (attempted.length < log.prescription.sets) return 'incomplete';
  return 'made';
}

/** The weight actually lifted (section 3's logged-weights rule). */
export function workWeight(log: LiftLog): number {
  const attempted = log.sets.filter((s) => !s.skipped);
  if (attempted.length === 0) return log.prescription.weight;
  return READINGS.MIXED_WORK_WEIGHTS_USE_LOWEST
    ? Math.min(...attempted.map((s) => s.weight))
    : (attempted[0]?.weight ?? log.prescription.weight);
}

function schemeOf(st: EngineState, log: LiftLog): 'normal' | 'short' {
  const s = shortScheme(st.program, log.lift);
  return s && log.prescription.sets === s.sets && log.prescription.reps === s.reps ? 'short' : 'normal';
}

/** Section 11 for every lift (paused and returning lifts use their own gap later), plus chins and dips. */
export function applyMissedTraining(
  st: EngineState,
  lifts: Record<string, LiftState>,
  assist: Record<string, AssistState>,
  daysAway: number | null,
): void {
  if (daysAway === null || daysAway <= 5) return;
  const ctx = { program: st.program, inv: inventoryFrom(st.settings) };
  const age = ageBracketOf(st);
  for (const lift of BARBELL_LIFTS) {
    const s = lifts[lift]!;
    if (s.pain !== 'none') continue;
    applyLayoffBand(s, daysAway, age, ctx);
  }
  const cd = st.program.missedTraining.chinsDips;
  if (daysAway <= cd.repeatUpToDays) return;
  if (daysAway <= 60) {
    const more = daysAway <= 21 ? cd.addLbUpTo21Days : cd.addLbUpTo60Days;
    for (const k of ['chin', 'dip'] as const) if (!assist[k]!.needsCalibration) assist[k] = addAssistance(assist[k]!, more);
    return;
  }
  const chin = assist.chin!;
  const start = (chin.mode === 'LOAD' || chin.mode === 'REPS_BUILD' ? chin.assistance : 0) + READINGS.CHIN_RECALIBRATION_EXTRA_LB;
  assist.chin = { ...chin, needsCalibration: true, calibrationStart: start };
  assist.dip = { ...assist.dip!, needsCalibration: true, calibrationStart: start };
}

/** A paused lift back after more than 7 days uses the section 11 table on its own. */
export function applyOwnGap(st: EngineState, s: LiftState, date: LocalDate): void {
  if (!s.lastHeavyDate) return;
  const gap = daysBetween(s.lastHeavyDate, date);
  if (gap > 7) applyLayoffBand(s, gap, ageBracketOf(st), { program: st.program, inv: inventoryFrom(st.settings) });
}

// ------------------------------------------------------------ events

function applySetup(st: EngineState, ev: SetupEvent): void {
  st.setupDate = ev.date;
  st.screening.setup = ev.screeningAcknowledged;
  st.settings = {
    ...st.settings,
    ...(ev.ageBracket ? { ageBracket: ev.ageBracket } : {}),
    barLb: ev.barLb,
    plates: ev.plates,
    assistFiveLbSteps: ev.assistFiveLbSteps,
    assistTwoPointFiveLbSteps: ev.assistTwoPointFiveLbSteps,
    pullChoice: ev.pullChoice,
  };
  if (ev.bodyweightLb) st.bodyweights.push({ date: ev.date, lb: ev.bodyweightLb });
}

export function applyEvent(st: EngineState, ev: AnyEvent): void {
  switch (ev.type) {
    case 'setup':
      return applySetup(st, ev);
    case 'liftingSession':
      return processLiftingSession(st, ev);
    case 'conditioningSession':
      return processConditioningSession(st, ev);
    case 'bodyweight':
      st.bodyweights.push({ date: ev.date, lb: ev.pounds });
      return;
    case 'settingsChange':
      st.settings = { ...st.settings, [ev.key]: ev.newValue };
      return;
    case 'weekDeclaration': {
      const ws = weekStart(ev.date);
      const nextWs = addDays(ws, 7);
      if (ev.kind === 'floor') st.floorOverrides.set(ev.scope === 'nextWeek' ? nextWs : ws, true);
      if (ev.kind === 'light' || ev.kind === 'illness') {
        st.lightMarkers.push(ev.scope === 'nextWeek' ? nextWs : ev.date);
        st.suggestions = st.suggestions.filter((s) => s.kind !== 'lightWeek');
      }
      if (ev.kind === 'overload') st.overloadPending = true;
      evaluateLightWeek(st, ev.date);
      return;
    }
    case 'floorWeekAdded':
    case 'floorWeekRemoved':
      st.floorOverrides.set(ev.weekStart, ev.type === 'floorWeekAdded');
      return;
    case 'screeningAcknowledged':
      if (ev.context !== 'setup') st.screening.intervals = true;
      return;
    case 'foodLeverAnswer': {
      if (ev.answer) {
        st.foodLever.on = true;
        st.foodLever.since ??= ev.date;
      }
      const ctx = liftCtx(st, ev.date);
      const targets = READINGS.FOOD_LEVER_ANSWER_APPLIES_TO_ALL_PENDING ? BARBELL_LIFTS : [ev.lift];
      for (const lift of targets) resolveFoodLever(st.lifts[lift], ev.answer, ctx);
      st.suggestions = st.suggestions.filter(
        (s) => s.kind !== 'foodLever' || (s.lift && st.lifts[s.lift as keyof typeof st.lifts]?.pendingFoodLever),
      );
      return;
    }
    case 'illness':
      if (ev.kind === 'start') {
        if (ev.symptoms) st.sickPeriods.push({ from: ev.date, to: null });
        else st.lightMarkers.push(ev.date);
      } else {
        const open = st.sickPeriods.find((p) => p.to === null);
        if (open) open.to = ev.date;
        st.lightMarkers.push(ev.date);
      }
      return;
    case 'painCleared': {
      const s = st.lifts[ev.lift];
      if (s.pain === 'paused') s.pain = 'returning';
      return;
    }
    case 'suggestionDismissed':
      st.suggestions = st.suggestions.filter((s) => !(s.kind === ev.suggestion && (!ev.lift || s.lift === ev.lift)));
      return;
    case 'override':
      return applyOverride(st, ev);
  }
}

function applyOverride(st: EngineState, ev: OverrideEvent): void {
  if (ev.lift === 'chin' || ev.lift === 'dip') {
    if (ev.field !== 'assistance') return;
    const a = st.assist[ev.lift];
    st.assist[ev.lift] = {
      ...a,
      needsCalibration: false,
      calibrationStart: null,
      assistance: Math.max(0, ev.value),
      addedLoad: 0,
      mode: ev.value > 0 ? 'LOAD' : 'BODYWEIGHT',
      targetReps: 5,
      missStreak: 0,
      lastTotalReps: null,
    };
    return;
  }
  const s = st.lifts[ev.lift];
  switch (ev.field) {
    case 'next':
      s.overrideNext = { weight: ev.value, sets: ev.sets, reps: ev.reps, reason: ev.reason };
      return;
    case 'lcw':
      s.lcw = ev.value;
      s.next = normalAt(st.program, s.lift, ev.value);
      s.nextBasis = { kind: 'fixed' };
      s.needsCalibration = false;
      return;
    case 'restart':
      Object.assign(s, {
        stage: 'NORMAL',
        round: 0,
        lcw: ev.value,
        next: normalAt(st.program, s.lift, ev.value),
        nextBasis: { kind: 'fixed' },
        hasMissed: false,
        hasBeenNotCrisp: false,
        resetCount: 0,
        lastResetFrom: null,
        lastResetDate: null,
        holdUntil: null,
        foodLeverRound: false,
        pendingFoodLever: null,
        lastCompleted: null,
        smallJumpCount: 0,
        smallJumpReachedOn: null,
      } satisfies Partial<LiftState>);
      return;
    case 'assistance':
      return;
  }
}

// ------------------------------------------------------------ lifting

function processLiftingSession(st: EngineState, ev: LiftingSessionEvent): void {
  if (ev.stopped) return;
  const date = ev.date;
  const prev = lastSession(st);
  const daysAway = prev ? daysBetween(prev.date, date) : null;

  applyMissedTraining(st, st.lifts, st.assist, daysAway);

  for (const lift of BARBELL_LIFTS) {
    const s = st.lifts[lift];
    if (READINGS.UNANSWERED_FOOD_LEVER_IS_NO && s.pendingFoodLever && s.pendingFoodLever.date < date) {
      resolveFoodLever(s, false, liftCtx(st, date));
    }
  }
  for (const lift of ev.checkIns.jointPain ?? []) st.lifts[lift].pain = 'paused';

  for (const log of ev.lifts) processLiftLog(st, ev, log);
  processAssist(st, ev);

  st.sessions.push({ event: ev, date, workout: ev.workout, weekType: ev.weekType, spinMinutes: ev.spinMinutes ?? 0 });

  if (st.flat.askPending) {
    st.flat.askPending = false;
    if (ev.checkIns.flatFromIntervals) st.flat.halveNext = true;
  }
  st.streaks.mostNightsUnder7 = ev.checkIns.mostNightsUnder7 ? st.streaks.mostNightsUnder7 + 1 : 0;
  st.streaks.warmupsHeavy = ev.checkIns.warmupsHeavy ? st.streaks.warmupsHeavy + 1 : 0;
  evaluateLightWeek(st, date);
}

function processLiftLog(st: EngineState, ev: LiftingSessionEvent, log: LiftLog): void {
  const s = st.lifts[log.lift];
  const date = ev.date;
  const ctx = liftCtx(st, date);
  const kind = log.prescription.kind;
  const stageBefore = s.stage;
  const resetsBefore = s.resetCount;
  const record = (result: 'made' | 'missed' | 'incomplete' | 'painStop', weight: number) =>
    s.history.push({
      date,
      kind,
      weight,
      sets: log.prescription.sets,
      reps: log.prescription.reps,
      result,
      effort: log.effort ?? null,
      stageBefore,
      stageAfter: s.stage,
      reset: s.resetCount > resetsBefore,
    });

  // Section 12: pain.
  if (s.pain === 'paused') {
    if (log.painAnswer !== 'gone') return;
    s.pain = 'returning';
  }
  if (s.pain === 'returning') {
    if (log.painStop) {
      s.pain = 'paused';
      record('painStop', workWeight(log));
      return;
    }
    const outcome = evaluate(log);
    if (outcome === 'incomplete' && log.sets.every((x) => x.skipped)) return;
    applyOwnGap(st, s, date);
    s.pain = 'none';
    record(outcome, workWeight(log));
    return;
  }
  if (log.painStop) {
    s.pain = 'paused';
    // Section 0: the lift ran its normal prescription, so this was its last heavy
    // session for the return rule in section 11, though it moves no progression.
    if (READINGS.PAIN_STOP_COUNTS_AS_LAST_HEAVY && (kind === 'heavy' || kind === 'calibration') && log.sets.some((x) => !x.skipped)) {
      s.lastHeavyDate = date;
    }
    record('painStop', workWeight(log));
    return;
  }

  // Light days, light weeks, and floor weeks move nothing.
  if (kind === 'lightDay' || kind === 'lightWeek' || kind === 'floor') {
    record(evaluate(log), workWeight(log));
    return;
  }

  // Section 11: "Did that warm-up feel heavy?"
  if (log.layoffWarmupHeavy && s.preLayoffLcw !== null) {
    const band = st.program.missedTraining.bands[3] as { ifLastWarmupHeavyFractionOfPreLayoffLcw: number };
    s.lcw = pctWeight(ctx, s.preLayoffLcw, band.ifLastWarmupHeavyFractionOfPreLayoffLcw, s.lift);
    s.next = normalAt(st.program, s.lift, s.lcw);
    s.preLayoffLcw = null;
  }

  const outcome = evaluate(log);

  if (kind === 'graduated' || s.stage === 'GRADUATED') {
    if (outcome === 'made') {
      const W = workWeight(log);
      s.lastCompleted = { weight: W, sets: log.prescription.sets, reps: log.prescription.reps };
      s.next = normalAt(st.program, s.lift, W);
      s.lastHeavyDate = date;
      s.lastHeavyWeight = W;
    }
    record(outcome, workWeight(log));
    return;
  }

  // Section 9: a calibration that found its weight sticks, even if the work sets weren't finished.
  const calibrating = s.needsCalibration;
  if (calibrating && log.calibration && (log.lift === 'bench' || log.lift === 'row' || log.lift === 'powerClean')) {
    const found = calibrationOutcome(log.calibration.sets, log.lift as CalibratedLift, st.program);
    if (found && outcome === 'incomplete') {
      s.needsCalibration = false;
      s.lcw = found.workWeight;
      s.next = normalAt(st.program, s.lift, found.workWeight);
    }
  }
  if (outcome === 'incomplete') {
    record('incomplete', workWeight(log));
    return;
  }

  const W = workWeight(log);
  s.needsCalibration = false;
  if (calibrating && !READINGS.CALIBRATION_DAY_PROGRESSES) {
    s.lcw = W;
    s.next = normalAt(st.program, s.lift, W);
    s.lastHeavyDate = date;
    s.lastHeavyWeight = W;
    s.lastEffort = log.effort ?? null;
    record(outcome, W);
    return;
  }
  applyHeavyResult(s, outcome, W, log.effort ?? null, schemeOf(st, log), ctx);
  record(outcome, W);
}

function processAssist(st: EngineState, ev: LiftingSessionEvent): void {
  if (ev.weekType === 'floor') return;
  if (ev.equipmentDown?.includes('assistMachine') || (ev.substitutions?.length ?? 0) > 0) return;
  const ctx = assistCtx(st);
  for (const lift of ['chin', 'dip'] as const) {
    const log = ev.assist?.[lift];
    if (!log) continue;
    let a = st.assist[lift];
    if (log.calibration) a = calibrateAssist(a, log.calibration.setting);
    else if (a.needsCalibration && log.kind === 'heavy') a = calibrateAssist(a, log.assistance);
    const progresses = log.kind === 'heavy' && (!log.calibration || READINGS.CALIBRATION_DAY_PROGRESSES);
    if (progresses) a = applyAssistResult(a, log, ctx);
    st.assist[lift] = { ...a, lastSessionDate: ev.date };
  }
}

// ------------------------------------------------------------ conditioning

function processConditioningSession(st: EngineState, ev: ConditioningSessionEvent): void {
  if (ev.stopped) return;
  st.cond = advanceCond(st, st.cond, weekStart(ev.date));
  const counted = ev.actualMinutes >= st.program.conditioning.minimumSessionMin;
  if (counted) {
    st.cond = condLayoff(st, st.cond, ev.date).cond;
    st.cond.lastCountedDate = ev.date;
  }
  st.condSessions.push({
    event: ev,
    date: ev.date,
    minutes: ev.actualMinutes,
    counted,
    intervalsDone: ev.intervalsDone,
    phase: ev.phase,
  });
  if (ev.intervalsDone > 0) {
    st.flat.askPending = true;
    st.flat.halveNext = false;
  }
}

// ------------------------------------------------------------ section 10 triggers

export function liftsOnLadder(st: EngineState, date: LocalDate): string[] {
  const stages = st.program.stallLadder.onTheLadderStages as string[];
  const days = st.program.stallLadder.recentResetCountsAsOnLadderDays;
  return BARBELL_LIFTS.filter((l) => {
    const s = st.lifts[l];
    if (stages.includes(s.stage)) return true;
    return s.lastResetDate !== null && daysBetween(s.lastResetDate, date) <= days;
  });
}

/** Checked after every lifting session and when the user declares something. */
function evaluateLightWeek(st: EngineState, date: LocalDate): void {
  const t = st.program.deload.lightWeekTriggers;
  const reasons: string[] = [];
  if (liftsOnLadder(st, date).length >= 2) reasons.push(t[0]!);
  if (st.streaks.mostNightsUnder7 >= 2) reasons.push(t[1]!);
  if (st.streaks.warmupsHeavy >= 2) reasons.push(t[2]!);
  if (st.overloadPending) reasons.push(t[3]!);
  st.overloadPending = false;
  if (reasons.length === 0) return;
  const nextWeek = addDays(weekStart(date), 7);
  if (weekTypeOn(st, date) !== 'normal' || weekTypeOn(st, nextWeek) !== 'normal') return;
  addSuggestion(st, {
    kind: 'lightWeek',
    since: date,
    message: 'A light week would help. Take it the rest of this week, next week, or not now.',
    reasons,
  });
}
