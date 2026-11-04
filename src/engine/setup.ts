// First launch (RULES.md section 17): seed the log with the 2026-11-02
// session from program.json's startingState and the setup answers.

import type {
  AgeBracket,
  IsoTimestamp,
  LiftLog,
  LiftingSessionEvent,
  LocalDate,
  PlatePair,
  Program,
  PullChoice,
  SetupEvent,
  SpareReps,
  TableRating,
  Workout,
} from './types';

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
  program: Program,
  answers: SetupAnswers,
  opts: { setupDate: LocalDate; nowIso: IsoTimestamp; makeId: () => string },
): [SetupEvent, LiftingSessionEvent] {
  const eq = program.equipment;
  const start = program.startingState;
  const ts = opts.nowIso;

  const setup: SetupEvent = {
    id: opts.makeId(),
    type: 'setup',
    date: opts.setupDate,
    createdAt: ts,
    updatedAt: ts,
    ageBracket: answers.ageBracket,
    mondayEffort: answers.mondayEffort,
    chinSpare: answers.chinSpare,
    barLb: answers.barLb ?? eq.barLb,
    plates: answers.plates ?? eq.plateInventory.map((p) => ({ lb: p.lb, pairs: p.pairs })),
    assistFiveLbSteps: answers.assistFiveLbSteps ?? eq.assistMachine.fiveLbStepsPossible,
    assistTwoPointFiveLbSteps: answers.assistTwoPointFiveLbSteps ?? eq.assistMachine.twoPointFiveLbStepsPossible,
    pullChoice: answers.pullChoice ?? (program.workouts.pullChoice.default as PullChoice),
    bodyweightLb: answers.bodyweightLb === undefined ? program.athlete.bodyweightLb : answers.bodyweightLb,
    screeningAcknowledged: true,
  };

  const lift = (id: 'squat' | 'press' | 'deadlift', weight: number, effort: TableRating): LiftLog => {
    const { workSets, reps } = program.lifts[id];
    return {
      lift: id,
      prescription: { kind: 'heavy', weight, sets: workSets, reps },
      sets: Array.from({ length: workSets }, () => ({ weight, reps })),
      effort,
    };
  };

  const session: LiftingSessionEvent = {
    id: opts.makeId(),
    type: 'liftingSession',
    date: start.asOf,
    createdAt: ts,
    updatedAt: ts,
    workout: start.workout as Workout,
    weekType: 'normal',
    checkIns: {},
    lifts: [
      lift('squat', start.squat.lcw, answers.mondayEffort.squat),
      lift('press', start.press.lcw, answers.mondayEffort.press),
      lift('deadlift', start.deadlift.lcw, answers.mondayEffort.deadlift),
    ],
    assist: {
      chin: {
        kind: 'heavy',
        assistance: start.chin.assistanceLb,
        addedLoad: 0,
        reps: [5, 5, 5],
        targetReps: [5, 5, 5],
        spare: answers.chinSpare,
      },
    },
  };

  return [setup, session];
}
