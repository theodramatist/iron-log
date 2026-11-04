// Public engine API (SPEC.md section 3). Every call is a pure function of its input.

import { sickOn } from './calendar';
import { conditioningPlan } from './conditioning';
import { programWeek, weekStart } from './dates';
import { findNextLiftingDate, planForDate, summarizeWeek } from './plan';
import type { ConditioningPlan, DayPlan, SessionPlan, WeekSummary } from './planTypes';
import { inventoryFrom, loadableBetween } from './plates';
import { buildSessionPlan, type PrescribeOptions } from './prescribe';
import { BARBELL_LIFTS, liftLabel } from './programAccess';
import { replay } from './replay';
import type {
  AssistLiftId,
  AssistState,
  BarbellLiftId,
  EngineInput,
  EquipmentDown,
  LiftState,
  LocalDate,
  Settings,
  Suggestion,
} from './types';

export type { PrescribeOptions };

export type LiftStateView = LiftState & { label: string; lightDayOn: boolean; oncePerWeekOn: boolean };

export interface ProgramStateView {
  foodLeverOn: boolean;
  foodLeverSince: LocalDate | null;
  sick: boolean;
  screeningAtSetup: boolean;
  screeningBeforeIntervals: boolean;
}

/** What to do on a date: lifting, conditioning, off, or sick. */
export function planFor(input: EngineInput, date: LocalDate): DayPlan {
  return planForDate(input, date);
}

/** The full lifting plan for a session started on `date`. */
export function prescribe(input: EngineInput, date: LocalDate, opts: PrescribeOptions = {}): SessionPlan {
  return buildSessionPlan(replay(input, date), date, opts);
}

export function liftStates(input: EngineInput): Record<BarbellLiftId, LiftStateView> {
  const st = replay(input, input.today);
  const week = programWeek(input.today, input.program.athlete.startDate);
  return Object.fromEntries(
    BARBELL_LIFTS.map((lift) => {
      const s = st.lifts[lift];
      const on = s.smallJumpReachedOn !== null && s.stage !== 'GRADUATED';
      return [
        lift,
        {
          ...s,
          label: liftLabel(input.program, lift),
          lightDayOn: lift === 'squat' && on,
          oncePerWeekOn:
            lift === 'deadlift' &&
            on &&
            input.today > (s.smallJumpReachedOn ?? '') &&
            week >= input.program.deadliftOncePerWeek.earliestProgramWeek,
        },
      ];
    }),
  ) as Record<BarbellLiftId, LiftStateView>;
}

export function assistStates(input: EngineInput): Record<AssistLiftId, AssistState> {
  return replay(input, input.today).assist;
}

export function conditioningState(
  input: EngineInput,
  date: LocalDate,
  opts: { shortNight?: boolean; targetMinutes?: number; intervals?: number; equipmentDown?: EquipmentDown[] } = {},
): ConditioningPlan {
  return conditioningPlan(replay(input, date), date, opts);
}

export function weekSummary(input: EngineInput, weekStartDate: LocalDate): WeekSummary {
  return summarizeWeek(input, weekStartDate);
}

/** Pending suggestions: light week, food lever, graduation, early-stall note. */
export function triggers(input: EngineInput): Suggestion[] {
  return [...replay(input, input.today).suggestions];
}

export function nextLiftingDate(input: EngineInput, from: LocalDate): LocalDate | null {
  return findNextLiftingDate(input, from);
}

/** Section 4: a smaller jump than the suggestion, down to a repeat, never a larger one. */
export function jumpChoices(input: EngineInput, lift: BarbellLiftId): number[] {
  const st = replay(input, input.today);
  const s = st.lifts[lift];
  if (!s.next) return [];
  if (s.stage !== 'NORMAL' || s.lcw === null) return [s.next.weight];
  return loadableBetween(s.lcw, s.next.weight, inventoryFrom(st.settings));
}

export function effectiveSettings(input: EngineInput, date?: LocalDate): Settings {
  return replay(input, date ?? input.today).settings;
}

export interface FloorWeekView {
  weekStart: LocalDate;
  /** The preloaded name, such as "Christmas week", or null for one he added. */
  label: string | null;
  scheduled: boolean;
}

/** Floor weeks as of today: the preloaded ones he hasn't removed, plus any he added or declared (RULES.md section 10). */
export function floorWeeks(input: EngineInput): FloorWeekView[] {
  const st = replay(input, input.today);
  const out = new Map<LocalDate, FloorWeekView>();
  for (const f of input.program.deload.scheduledFloorWeeks) {
    const ws = weekStart(f.start);
    out.set(ws, { weekStart: ws, label: f.label, scheduled: true });
  }
  for (const [ws, on] of st.floorOverrides) {
    if (!on) out.delete(ws);
    else if (!out.has(ws)) out.set(ws, { weekStart: ws, label: null, scheduled: false });
  }
  return [...out.values()].sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1));
}

/** Every weigh-in, setup's included, oldest first. */
export function bodyweightHistory(input: EngineInput): { date: LocalDate; lb: number }[] {
  return [...replay(input, input.today).bodyweights].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function programState(input: EngineInput): ProgramStateView {
  const st = replay(input, input.today);
  return {
    foodLeverOn: st.foodLever.on,
    foodLeverSince: st.foodLever.since,
    sick: sickOn(st, input.today),
    screeningAtSetup: st.screening.setup,
    screeningBeforeIntervals: st.screening.intervals,
  };
}
