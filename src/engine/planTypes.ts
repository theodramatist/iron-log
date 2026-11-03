// What the engine returns to the UI (SPEC.md section 3).

import type {
  AssistLiftId,
  AssistMode,
  BarbellLiftId,
  ConditioningSessionEvent,
  LiftId,
  LiftingSessionEvent,
  LocalDate,
  PrescriptionKind,
  Stage,
  SuggestionKind,
  WeekType,
  Workout,
} from './types';

export interface WarmupSet {
  weight: number;
  reps: number;
  plates: number[];
}

export interface CalibrationPlan {
  repsPerSet: number;
  startWeight: number;
  stepFast: number;
  stepSlowing: number;
  buttons: string[];
  /** Total work sets once the ramp ends (the slowed set counts as the first). */
  workSets: number;
}

export interface LiftPlan {
  slot: number;
  lift: BarbellLiftId;
  label: string;
  kind: PrescriptionKind;
  weight: number;
  sets: number;
  reps: number;
  plates: number[];
  warmups: WarmupSet[];
  stage: Stage;
  round: number;
  /** Shown when the stage isn't NORMAL, as in "Bridge: 5×3 at 250". */
  stageLabel: string | null;
  restSec: number;
  cues: string[];
  notes: string[];
  /** 22-to-60-day return: the work weight if "Did that warm-up feel heavy?" is yes. */
  layoffHeavyWeight: number | null;
  calibration: CalibrationPlan | null;
}

export interface PausedLiftPlan {
  slot: number;
  lift: BarbellLiftId;
  label: string;
  message: string;
  /** Ask "Is the <lift> pain gone?" before the session. */
  question: string;
}

export interface AssistMovementPlan {
  lift: AssistLiftId;
  label: string;
  kind: 'heavy' | 'lightWeek';
  mode: AssistMode;
  assistance: number;
  addedLoad: number;
  targetReps: number[];
  /** Bodyweight minus assistance, or plus belt weight. */
  effectiveLoad: number | null;
  bodyweightLb: number | null;
  bodyweightDate: LocalDate | null;
  /** The latest weigh-in is more than 14 days old. */
  bodyweightStale: boolean;
  negatives: number;
  cues: string[];
  calibration: { start: number; step: number; closeStep: number; instructions: string } | null;
}

export interface SubstitutionPlan {
  exercise: string;
  sets: number;
  reps: number | null;
  repsToSpare: number;
  replaces: AssistLiftId;
}

export interface AssistBlockPlan {
  rounds: number;
  restSec: number;
  chin: AssistMovementPlan | null;
  dip: AssistMovementPlan | null;
  substitutions: SubstitutionPlan[] | null;
}

export type MissedBand = 'normal' | 'repeat' | 'drop' | 'dropAskWarmup' | 'restartLight';

export interface PendingQuestion {
  kind: 'foodLever';
  lift: BarbellLiftId;
  question: string;
}

export interface SessionPlan {
  date: LocalDate;
  workout: Workout;
  weekType: WeekType;
  programWeek: number;
  daysAway: number | null;
  missedBand: MissedBand | null;
  lifts: LiftPlan[];
  paused: PausedLiftPlan[];
  assist: AssistBlockPlan | null;
  beforeLifting: string;
  afterLiftingSpin: { minutes: number; optional: boolean } | null;
  checkIns: { start: { id: string; text: string }[]; end: { id: string; text: string }[] };
  askFlatFromIntervals: boolean;
  pendingQuestions: PendingQuestion[];
  notes: string[];
  foodLines: string[];
  needsConsecutiveConfirm: boolean;
  sameDayWarning: boolean;
}

export interface ConditioningPlan {
  date: LocalDate;
  conditioningWeek: number;
  phase: number;
  /** The phase's range. */
  range: [number, number];
  /** Lowest choice on the stepper: 20 minutes when short on time. */
  minMinutes: number;
  targetMinutes: number;
  intervals: number;
  maxIntervals: number;
  /** Why there are no intervals today, when the phase would have them. */
  noIntervalsReason: string | null;
  layout: { easyBeforeSec: number; intervalBlockSec: number; easyAfterSec: number } | null;
  machines: { easy: 'air bike' | 'treadmill walk'; intervals: 'SkiErg' | 'air bike' | null };
  /** The screening note must be acknowledged before this interval session starts. */
  screeningGate: boolean;
  layoffDrop: 'none' | 'phase' | 'restart';
}

export type DayKind = 'lifting' | 'conditioning' | 'off' | 'sick';
export type DayStatus = 'planned' | 'done' | 'missed' | 'off';

export interface Banner {
  kind: SuggestionKind;
  message: string;
  lift?: LiftId;
}

export interface DayPlan {
  date: LocalDate;
  weekday: number;
  weekType: WeekType;
  programWeek: number;
  kind: DayKind;
  status: DayStatus;
  /** What "Swap today" would start instead, or null when no swap is available. */
  swapTo: 'lifting' | 'conditioning' | null;
  needsConsecutiveConfirm: boolean;
  workout: Workout | null;
  /** "Squat 3×5 · 115" lines. */
  summary: string[];
  conditioning: ConditioningPlan | null;
  loggedLifting: LiftingSessionEvent[];
  loggedConditioning: ConditioningSessionEvent[];
  message: string | null;
  notes: string[];
  foodLines: string[];
  calendarNote: string | null;
  banners: Banner[];
}

export interface WeekSummary {
  weekStart: LocalDate;
  weekType: WeekType;
  days: DayPlan[];
  liftingDone: number;
  conditioningDone: number;
  conditioningMinutes: number;
  conditioningTargetMinutes: number;
  calendarNotes: { date: LocalDate; label: string }[];
}
