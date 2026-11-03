// Public engine API (SPEC.md section 3). Stub until M1c.
import type { ConditioningPlan, DayPlan, SessionPlan, WeekSummary } from './planTypes';
import type { AssistLiftId, AssistState, BarbellLiftId, CheckIns, EngineInput, EquipmentDown, LiftState, LocalDate, Settings, Suggestion } from './types';

export interface PrescribeOptions {
  checkIns?: CheckIns;
  painAnswers?: Partial<Record<BarbellLiftId, 'gone' | 'stillThere'>>;
  equipmentDown?: EquipmentDown[];
}
export type LiftStateView = LiftState & { label: string; lightDayOn: boolean; oncePerWeekOn: boolean };
export interface ProgramStateView {
  foodLeverOn: boolean;
  foodLeverSince: LocalDate | null;
  sick: boolean;
  screeningAtSetup: boolean;
  screeningBeforeIntervals: boolean;
}
const todo = (): never => { throw new Error('not implemented'); };
export function planFor(_input: EngineInput, _date: LocalDate): DayPlan { return todo(); }
export function prescribe(_input: EngineInput, _date: LocalDate, _opts?: PrescribeOptions): SessionPlan { return todo(); }
export function liftStates(_input: EngineInput): Record<BarbellLiftId, LiftStateView> { return todo(); }
export function assistStates(_input: EngineInput): Record<AssistLiftId, AssistState> { return todo(); }
export function conditioningState(
  _input: EngineInput,
  _date: LocalDate,
  _opts?: { shortNight?: boolean; targetMinutes?: number; intervals?: number; equipmentDown?: EquipmentDown[] },
): ConditioningPlan { return todo(); }
export function weekSummary(_input: EngineInput, _weekStart: LocalDate): WeekSummary { return todo(); }
export function triggers(_input: EngineInput): Suggestion[] { return todo(); }
export function nextLiftingDate(_input: EngineInput, _from: LocalDate): LocalDate | null { return todo(); }
export function jumpChoices(_input: EngineInput, _lift: BarbellLiftId): number[] { return todo(); }
export function effectiveSettings(_input: EngineInput, _date?: LocalDate): Settings { return todo(); }
export function programState(_input: EngineInput): ProgramStateView { return todo(); }
