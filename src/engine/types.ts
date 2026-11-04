// Types shared by the engine, the data layer, and the UI.
// SPEC.md section 4 defines the events; RULES.md defines the state.

import type programJson from '../program/program.json';

export type Program = typeof programJson;

/** A local calendar date, `YYYY-MM-DD`. */
export type LocalDate = string;
/** An ISO 8601 timestamp, used only for clocks and ordering. */
export type IsoTimestamp = string;

export type BarbellLiftId = 'squat' | 'press' | 'bench' | 'deadlift' | 'powerClean' | 'row';
export type AssistLiftId = 'chin' | 'dip';
export type LiftId = BarbellLiftId | AssistLiftId;
export type Workout = 'A' | 'B';
export type WeekType = 'normal' | 'light' | 'floor';
export type Stage = 'NORMAL' | 'REPEAT' | 'BRIDGE_SHORT' | 'BRIDGE_NORMAL' | 'HOLD' | 'GRADUATED';
export type TableRating = 'light' | 'rir3to4' | 'rir1to2' | 'grind';
export type CleanRowRating = 'crisp' | 'notCrisp';
export type EffortRating = TableRating | CleanRowRating | 'missed';
export type AssistMode = 'LOAD' | 'REPS_BUILD' | 'BODYWEIGHT' | 'WEIGHTED';
/** Reps to spare on the last chin or dip set. 2 means "2 or more". */
export type SpareReps = 0 | 1 | 2;
export type PainStatus = 'none' | 'paused' | 'returning';
export type AgeBracket = 'under40' | '40plus';
export type PullChoice = 'row' | 'powerClean';

/** What a lift ran in a session. Only `heavy` and `calibration` move progression. */
export type PrescriptionKind =
  | 'heavy'
  | 'calibration'
  | 'lightDay'
  | 'lightWeek'
  | 'floor'
  | 'painReturn'
  | 'graduated';

export interface PlatePair {
  lb: number;
  /** `null` means unlimited. */
  pairs: number | null;
}

export interface Settings {
  ageBracket: AgeBracket | null;
  barLb: number;
  plates: PlatePair[];
  assistFiveLbSteps: boolean;
  assistTwoPointFiveLbSteps: boolean;
  pullChoice: PullChoice;
  splitChinsDips: boolean;
  /** "SkiErg bothers my elbows or shoulders": intervals move to the air bike. */
  skiErgToAirBike: boolean;
}

// ---------------------------------------------------------------- events

interface BaseEvent {
  id: string;
  date: LocalDate;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export interface SetupEvent extends BaseEvent {
  type: 'setup';
  ageBracket: AgeBracket | null;
  mondayEffort: { squat: TableRating; press: TableRating; deadlift: TableRating };
  chinSpare: SpareReps;
  barLb: number;
  plates: PlatePair[];
  assistFiveLbSteps: boolean;
  assistTwoPointFiveLbSteps: boolean;
  pullChoice: PullChoice;
  bodyweightLb: number | null;
  screeningAcknowledged: boolean;
}

export interface WorkSetLog {
  weight: number;
  reps: number;
  formBroke?: boolean;
  skipped?: boolean;
}

export type CalibrationVerdict = 'fast' | 'slowing' | 'slowed';

export interface CalibrationSetLog {
  weight: number;
  reps: number;
  /** `slowed` is "Clearly slowed" for bench and rows, "Bar speed dropped" for cleans. */
  verdict: CalibrationVerdict;
}

export interface CheckIns {
  lastNightUnder6?: boolean;
  mostNightsUnder7?: boolean;
  /** Lifts paused by "Any joint pain right now?" before the session. */
  jointPain?: BarbellLiftId[];
  warmupsHeavy?: boolean;
  flatFromIntervals?: boolean;
}

export interface LiftLog {
  lift: BarbellLiftId;
  prescription: { kind: PrescriptionKind; weight: number; sets: number; reps: number };
  warmupsDone?: number;
  /** The 22-to-60-day return question: "Did that warm-up feel heavy?" */
  layoffWarmupHeavy?: boolean;
  /** The answer to "Is the <lift> pain gone?" for a paused lift. */
  painAnswer?: 'gone' | 'stillThere';
  sets: WorkSetLog[];
  effort?: EffortRating;
  painStop?: boolean;
  /** Not reached because time ran out or he had to leave. Not a miss. */
  notReached?: boolean;
  calibration?: { sets: CalibrationSetLog[] };
}

export interface AssistMovementLog {
  kind: 'heavy' | 'lightWeek';
  /** Pounds of help from the machine (0 in BODYWEIGHT or WEIGHTED). */
  assistance: number;
  /** Pounds on the belt in WEIGHTED. */
  addedLoad: number;
  reps: number[];
  targetReps: number[];
  spare?: SpareReps;
  negativesDone?: boolean;
  /** First appearance (dips) or a recalibration after a long layoff. */
  calibration?: { sets: { assistance: number; reps: number }[]; setting: number };
}

export type EquipmentDown = 'assistMachine' | 'skiErg' | 'airBike';

export interface SubstitutionLog {
  exercise: string;
  sets: number;
  reps: number[];
  replaces: AssistLiftId;
}

export interface LiftingSessionEvent extends BaseEvent {
  type: 'liftingSession';
  workout: Workout;
  weekType: WeekType;
  startedAt?: IsoTimestamp;
  endedAt?: IsoTimestamp;
  checkIns: CheckIns;
  lifts: LiftLog[];
  assist?: { chin?: AssistMovementLog; dip?: AssistMovementLog };
  substitutions?: SubstitutionLog[];
  equipmentDown?: EquipmentDown[];
  spinMinutes?: number;
  notes?: string;
  /** Ended with the Stop session button. Nothing from it counts. */
  stopped?: boolean;
}

export interface ConditioningSessionEvent extends BaseEvent {
  type: 'conditioningSession';
  conditioningWeek: number;
  phase: number;
  shortNight: boolean;
  targetMinutes: number;
  actualMinutes: number;
  machines: { easy: 'air bike' | 'treadmill walk'; intervals?: 'SkiErg' | 'air bike' };
  intervalsPlanned: number;
  intervalsDone: number;
  notes?: string;
  stopped?: boolean;
}

export interface BodyweightEvent extends BaseEvent {
  type: 'bodyweight';
  pounds: number;
}

export interface SettingsChangeEvent extends BaseEvent {
  type: 'settingsChange';
  key: keyof Settings;
  oldValue: unknown;
  newValue: unknown;
}

export interface WeekDeclarationEvent extends BaseEvent {
  type: 'weekDeclaration';
  weekStart: LocalDate;
  kind: 'light' | 'floor' | 'illness' | 'overload';
  scope: 'restOfWeek' | 'nextWeek';
}

export interface FloorWeekChangeEvent extends BaseEvent {
  type: 'floorWeekRemoved' | 'floorWeekAdded';
  weekStart: LocalDate;
}

export interface ScreeningAcknowledgedEvent extends BaseEvent {
  type: 'screeningAcknowledged';
  /** Where it was acknowledged. Setup's acknowledgment lives in the setup event. */
  context?: 'setup' | 'intervals' | 'settings';
}

export interface FoodLeverAnswerEvent extends BaseEvent {
  type: 'foodLeverAnswer';
  lift: BarbellLiftId;
  answer: boolean;
}

export interface IllnessEvent extends BaseEvent {
  type: 'illness';
  kind: 'start' | 'better';
  /** The answer to the symptom question, on `start`. */
  symptoms?: boolean;
}

export interface PainClearedEvent extends BaseEvent {
  type: 'painCleared';
  lift: BarbellLiftId;
  how: 'gone' | 'clinician';
}

export type SuggestionKind =
  | 'painCheck'
  | 'lightWeek'
  | 'foodLever'
  | 'graduation'
  | 'earlyStall'
  | 'maintenanceBreak'
  | 'sorenessNote';

export interface SuggestionDismissedEvent extends BaseEvent {
  type: 'suggestionDismissed';
  suggestion: SuggestionKind;
  lift?: LiftId;
}

export interface OverrideEvent extends BaseEvent {
  type: 'override';
  lift: LiftId;
  /**
   * `next`: the next prescription's weight (and optionally sets and reps).
   * `assistance`: a chin or dip assistance setting.
   * `lcw`: the base weight, as after a long layoff's editable start.
   * `restart`: restart a graduated lift's novice run at `value`.
   */
  field: 'next' | 'assistance' | 'lcw' | 'restart';
  value: number;
  sets?: number;
  reps?: number;
  reason: string;
}

/** "No time today" (RULES.md section 1, Q22): the day's planned session, skipped for lack of time. */
export interface SkipEvent extends BaseEvent {
  type: 'skip';
  kind: 'lifting' | 'conditioning';
  reason: 'time';
}

export type AnyEvent =
  | SetupEvent
  | LiftingSessionEvent
  | ConditioningSessionEvent
  | BodyweightEvent
  | SettingsChangeEvent
  | WeekDeclarationEvent
  | FloorWeekChangeEvent
  | ScreeningAcknowledgedEvent
  | FoodLeverAnswerEvent
  | IllnessEvent
  | PainClearedEvent
  | SuggestionDismissedEvent
  | OverrideEvent
  | SkipEvent;

export type EventType = AnyEvent['type'];

export interface EngineInput {
  program: Program;
  /** Base settings. The setup event and settingsChange events apply on top. */
  settings: Partial<Settings>;
  events: AnyEvent[];
  today: LocalDate;
}

// ---------------------------------------------------------------- state

export interface NextPrescription {
  weight: number;
  sets: number;
  reps: number;
  scheme: 'normal' | 'short';
}

/** How `next` was computed, so a short night or a smaller-jump choice can recompute it. */
export type NextBasis =
  | { kind: 'table'; rating: TableRating; lcw: number }
  | { kind: 'cleanRow'; lcw: number }
  | { kind: 'smallest'; lcw: number }
  | { kind: 'fixed' };

export interface LiftHistoryEntry {
  date: LocalDate;
  kind: PrescriptionKind;
  weight: number;
  sets: number;
  reps: number;
  result: 'made' | 'missed' | 'incomplete' | 'painStop';
  effort: EffortRating | null;
  stageBefore: Stage;
  stageAfter: Stage;
  reset: boolean;
}

export interface LiftState {
  lift: BarbellLiftId;
  needsCalibration: boolean;
  /** The base the next prescription builds on, normally the last weight made. */
  lcw: number | null;
  next: NextPrescription | null;
  nextBasis: NextBasis;
  /** "Your plates can't make a 1-lb jump. The next step up is 67.5." */
  jumpNote: string | null;
  stage: Stage;
  round: number;
  hasMissed: boolean;
  hasBeenNotCrisp: boolean;
  resetCount: number;
  lastResetFrom: number | null;
  lastResetDate: LocalDate | null;
  pain: PainStatus;
  holdUntil: LocalDate | null;
  /** Which scheme the next heavy session in HOLD runs before holdUntil. */
  holdNextScheme: 'short' | 'normal';
  /** In the extra round the food lever bought (section 5). */
  foodLeverRound: boolean;
  /** Waiting for "Has recovery felt poor?" */
  pendingFoodLever: { weight: number; date: LocalDate } | null;
  lastEffort: EffortRating | null;
  lastHeavyDate: LocalDate | null;
  lastHeavyWeight: number | null;
  /** Made heavy sessions in a row with a suggested jump of 5 lb or less (section 6). */
  smallJumpCount: number;
  /** When that count reached two, switching on the light squat day or once-a-week deadlift. */
  smallJumpReachedOn: LocalDate | null;
  /**
   * The last weight and sets completed, for a graduated lift's restart
   * suggestion (Q17). A GRADUATED lift's prefill is `next`, which a layoff drops.
   */
  lastCompleted: { weight: number; sets: number; reps: number } | null;
  /** lcw before a 22-to-60-day layoff drop, for the heavy-warm-up answer. */
  preLayoffLcw: number | null;
  overrideNext: { weight: number; sets?: number; reps?: number; reason: string } | null;
  history: LiftHistoryEntry[];
}

export interface AssistState {
  lift: AssistLiftId;
  needsCalibration: boolean;
  /** Starting point for a calibration (dips: the chin assistance; after a long layoff: higher). */
  calibrationStart: number | null;
  assistance: number;
  step: number;
  mode: AssistMode;
  targetReps: number;
  missStreak: number;
  lastMadeAssistance: number | null;
  addedLoad: number;
  lastTotalReps: number | null;
  lastSessionDate: LocalDate | null;
}

export interface Suggestion {
  kind: SuggestionKind;
  since: LocalDate;
  lift?: LiftId;
  message: string;
  reasons?: string[];
}
