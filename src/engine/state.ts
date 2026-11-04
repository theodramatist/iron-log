// Engine state, derived by replaying the event log (RULES.md introduction).

import { initialAssist } from './assist';
import { BARBELL_LIFTS, normalScheme } from './programAccess';
import type {
  AssistLiftId,
  AssistState,
  BarbellLiftId,
  ConditioningSessionEvent,
  LiftState,
  LiftingSessionEvent,
  LocalDate,
  Program,
  PullChoice,
  Settings,
  Suggestion,
  WeekType,
  Workout,
} from './types';

export interface SessionRecord {
  event: LiftingSessionEvent;
  date: LocalDate;
  workout: Workout;
  weekType: WeekType;
  spinMinutes: number;
}

export interface CondRecord {
  event: ConditioningSessionEvent;
  date: LocalDate;
  minutes: number;
  counted: boolean;
  intervalsDone: number;
  phase: number;
}

export interface CondState {
  /** The conditioning week for the calendar week starting `weekStart`. */
  week: number;
  weekStart: LocalDate | null;
  lastCountedDate: LocalDate | null;
}

export interface EngineState {
  program: Program;
  settings: Settings;
  setupDate: LocalDate | null;
  screening: { setup: boolean; intervals: boolean };
  lifts: Record<BarbellLiftId, LiftState>;
  assist: Record<AssistLiftId, AssistState>;
  bodyweights: { date: LocalDate; lb: number }[];
  sessions: SessionRecord[];
  condSessions: CondRecord[];
  /** Counted conditioning sessions per calendar week, so a week's count never rescans the log. */
  condCountedByWeek: Map<LocalDate, number>;
  cond: CondState;
  foodLever: { on: boolean; since: LocalDate | null };
  /** Week start to floor or not floor, overriding the preloaded schedule. */
  floorOverrides: Map<LocalDate, boolean>;
  /** Each marks the rest of its calendar week, from that date, as a light week. */
  lightMarkers: LocalDate[];
  sickPeriods: { from: LocalDate; to: LocalDate | null }[];
  streaks: { mostNightsUnder7: number; warmupsHeavy: number };
  overloadPending: boolean;
  suggestions: Suggestion[];
  flat: { askPending: boolean; halveNext: boolean };
  /** "No time today" skips, in log order (section 1). */
  skips: SkipRecord[];
}

export interface SkipRecord {
  id: string;
  date: LocalDate;
  kind: 'lifting' | 'conditioning';
}

export function defaultSettings(program: Program): Settings {
  return {
    ageBracket: null,
    barLb: program.equipment.barLb,
    plates: program.equipment.plateInventory.map((p) => ({ lb: p.lb, pairs: p.pairs })),
    assistFiveLbSteps: program.equipment.assistMachine.fiveLbStepsPossible,
    assistTwoPointFiveLbSteps: program.equipment.assistMachine.twoPointFiveLbStepsPossible,
    pullChoice: program.workouts.pullChoice.default as PullChoice,
    splitChinsDips: false,
    skiErgToAirBike: false,
  };
}

export function initialLift(program: Program, lift: BarbellLiftId): LiftState {
  const start = (program.startingState as unknown as Record<string, { lcw?: number }>)[lift]?.lcw;
  const n = normalScheme(program, lift);
  return {
    lift,
    needsCalibration: lift === 'bench' || lift === 'row' || lift === 'powerClean',
    lcw: null,
    next: start === undefined ? null : { weight: start, sets: n.sets, reps: n.reps, scheme: 'normal' },
    nextBasis: { kind: 'fixed' },
    jumpNote: null,
    stage: 'NORMAL',
    round: 0,
    hasMissed: false,
    hasBeenNotCrisp: false,
    resetCount: 0,
    lastResetFrom: null,
    lastResetDate: null,
    pain: 'none',
    holdUntil: null,
    holdNextScheme: 'short',
    foodLeverRound: false,
    pendingFoodLever: null,
    lastEffort: null,
    lastHeavyDate: null,
    lastHeavyWeight: null,
    smallJumpCount: 0,
    smallJumpReachedOn: null,
    lastCompleted: null,
    preLayoffLcw: null,
    overrideNext: null,
    history: [],
  };
}

export function initialState(program: Program, settings: Settings): EngineState {
  const lifts = Object.fromEntries(BARBELL_LIFTS.map((l) => [l, initialLift(program, l)])) as Record<
    BarbellLiftId,
    LiftState
  >;
  return {
    program,
    settings,
    setupDate: null,
    screening: { setup: false, intervals: false },
    lifts,
    assist: {
      chin: initialAssist('chin', program.startingState.chin.assistanceLb, false),
      dip: initialAssist('dip', 0, true),
    },
    bodyweights: [],
    sessions: [],
    condSessions: [],
    condCountedByWeek: new Map(),
    cond: { week: 1, weekStart: null, lastCountedDate: null },
    foodLever: { on: false, since: null },
    floorOverrides: new Map(),
    lightMarkers: [],
    sickPeriods: [],
    streaks: { mostNightsUnder7: 0, warmupsHeavy: 0 },
    overloadPending: false,
    suggestions: [],
    flat: { askPending: false, halveNext: false },
    skips: [],
  };
}

/** Shallow copies for a prescription's working state. History arrays are shared and never mutated there. */
export function cloneLifts(lifts: Record<BarbellLiftId, LiftState>): Record<BarbellLiftId, LiftState> {
  return Object.fromEntries(Object.entries(lifts).map(([k, v]) => [k, { ...v }])) as Record<BarbellLiftId, LiftState>;
}

export function cloneAssist(assist: Record<AssistLiftId, AssistState>): Record<AssistLiftId, AssistState> {
  return { chin: { ...assist.chin }, dip: { ...assist.dip } };
}

export function latestBodyweight(st: EngineState, date: LocalDate): { date: LocalDate; lb: number } | null {
  let best: { date: LocalDate; lb: number } | null = null;
  for (const b of st.bodyweights) if (b.date <= date && (!best || b.date >= best.date)) best = b;
  return best;
}
