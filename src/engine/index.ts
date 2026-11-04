// The rules engine's public API (SPEC.md section 3). Pure: no DOM,
// storage, or clock. Today's date is always an input.

export const ENGINE_SCHEMA_VERSION = 1;

export type * from './types';
export type * from './planTypes';

export {
  addDays,
  daysBetween,
  dayNumber,
  isValidDate,
  isWeekend,
  programWeek,
  weekdayIndex,
  weekdayName,
  weekStart,
} from './dates';

export {
  formatLb,
  inventoryFrom,
  isLoadable,
  largestLoadableAtOrBelow,
  loadableBetween,
  percentWeight,
  platesPerSide,
  progressionWeight,
  smallestLoadableAbove,
  type Inventory,
} from './plates';

export { BARBELL_LIFTS, liftLabel, liftNoun } from './programAccess';

export { READINGS } from './readings';
export { warmupSets } from './warmups';
export { calibrationNextWeight, calibrationOutcome, dipCalibrationNext, rampResult, type CalibrationResult } from './calibration';
export { spreadReps } from './assist';
export { restDefaultSec, timerRemainingSec, timeGuard, type SessionProgress, type TimerState } from './time';
export { buildSetupEvents, type SetupAnswers } from './setup';
export { sortEvents } from './replay';
export {
  assistStates,
  bodyweightHistory,
  conditioningState,
  effectiveSettings,
  floorWeeks,
  jumpChoices,
  liftStates,
  nextLiftingDate,
  planFor,
  prescribe,
  programState,
  triggers,
  weekSummary,
  type FloorWeekView,
  type LiftStateView,
  type PrescribeOptions,
  type ProgramStateView,
} from './api';
