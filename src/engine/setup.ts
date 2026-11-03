// First-launch seeding (RULES.md section 17). Stub until M1c.
import type { AgeBracket, IsoTimestamp, LiftingSessionEvent, LocalDate, PlatePair, Program, PullChoice, SetupEvent, SpareReps, TableRating } from './types';
export interface SetupAnswers {
  ageBracket: AgeBracket | null;
  mondayEffort: { squat: TableRating; press: TableRating; deadlift: TableRating };
  chinSpare: SpareReps;
  barLb?: number;
  plates?: PlatePair[];
  assistFiveLbSteps?: boolean;
  assistTwoPointFiveLbSteps?: boolean;
  pullChoice?: PullChoice;
  bodyweightLb?: number | null;
}
export function buildSetupEvents(
  _program: Program,
  _answers: SetupAnswers,
  _opts: { setupDate: LocalDate; nowIso: IsoTimestamp; makeId: () => string },
): [SetupEvent, LiftingSessionEvent] {
  throw new Error('not implemented');
}
