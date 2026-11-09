// buildLog(): a terse way to write scenarios (CLAUDE.md, M1).
//
// Each `.lift(date, results)` asks the engine for that day's prescription,
// then logs what the scenario says happened, the way the app does. So a
// scenario reads like its text: `.lift('2026-11-04', { squat: made('rir3to4') })`.
// Lifts left out of `results` are logged as not reached.

import programJson from '../../src/program/program.json';
import {
  assistStates,
  buildSetupEvents,
  conditioningState,
  jumpChoices,
  liftStates,
  planFor,
  prescribe,
  programState,
  triggers,
  weekSummary,
  type AnyEvent,
  type AssistLiftId,
  type AssistMovementLog,
  type BarbellLiftId,
  type CalibrationVerdict,
  type EffortRating,
  type EngineInput,
  type EquipmentDown,
  type LiftLog,
  type LiftPlan,
  type LiftingSessionEvent,
  type LocalDate,
  type OverrideEvent,
  type PrescribeOptions,
  type Program,
  type SessionPlan,
  type Settings,
  type SetupAnswers,
  type SpareReps,
  type SuggestionKind,
  type TableRating,
  type WeekDeclarationEvent,
} from '../../src/engine';

export const PROGRAM = programJson as Program;
export const START = '2026-11-02';

const BARBELL: BarbellLiftId[] = ['squat', 'press', 'bench', 'deadlift', 'powerClean', 'row'];
const NORMAL_SCHEME: Record<BarbellLiftId, [number, number]> = {
  squat: [3, 5],
  press: [3, 5],
  bench: [3, 5],
  deadlift: [1, 5],
  powerClean: [5, 3],
  row: [3, 5],
};

// ------------------------------------------------------------ outcomes

export type LiftOutcome =
  | { t: 'made'; effort?: EffortRating; weight?: number }
  | { t: 'missed'; reps?: number[]; weight?: number }
  | { t: 'formBroke'; weight?: number }
  | { t: 'skipped'; madeSets: number; weight?: number }
  | { t: 'notReached' }
  | { t: 'painStop'; afterSets: number }
  | { t: 'calibrate'; ramp: [number, CalibrationVerdict][]; lastMissed?: boolean; effort?: EffortRating };

/** Every prescribed rep made. `weight` logs a different weight (RULES.md section 3). */
export const made = (effort?: EffortRating, weight?: number): LiftOutcome => ({ t: 'made', effort, weight });
/** Reps per set, defaulting to the last set one rep short. */
export const missed = (reps?: number[], weight?: number): LiftOutcome => ({ t: 'missed', reps, weight });
export const missedAt = (weight: number, reps?: number[]): LiftOutcome => ({ t: 'missed', reps, weight });
export const madeAt = (weight: number, effort?: EffortRating): LiftOutcome => ({ t: 'made', effort, weight });
/** All reps done, but a rep was marked "form broke". */
export const formBroke = (weight?: number): LiftOutcome => ({ t: 'formBroke', weight });
/** The first `madeSets` sets made, the rest marked skipped. */
export const skipped = (madeSets: number, weight?: number): LiftOutcome => ({ t: 'skipped', madeSets, weight });
export const notReached = (): LiftOutcome => ({ t: 'notReached' });
export const painStop = (afterSets = 0): LiftOutcome => ({ t: 'painStop', afterSets });
export const calibrate = (
  ramp: [number, CalibrationVerdict][],
  opts: { lastMissed?: boolean; effort?: EffortRating } = {},
): LiftOutcome => ({ t: 'calibrate', ramp, ...opts });

export type AssistOutcome =
  | { t: 'made'; spare: SpareReps }
  | { t: 'missed'; reps?: number[] }
  | { t: 'reps'; reps: number[]; spare?: SpareReps }
  | { t: 'calibrate'; setting: number; spare: SpareReps };

/** Chin and dip outcomes. */
export const cd = {
  made: (spare: SpareReps): AssistOutcome => ({ t: 'made', spare }),
  missed: (reps?: number[]): AssistOutcome => ({ t: 'missed', reps }),
  reps: (reps: number[], spare?: SpareReps): AssistOutcome => ({ t: 'reps', reps, spare }),
  calibrate: (setting: number, spare: SpareReps): AssistOutcome => ({ t: 'calibrate', setting, spare }),
};

export type Results = Partial<Record<BarbellLiftId, LiftOutcome>> & {
  chin?: AssistOutcome;
  dip?: AssistOutcome;
};

export interface SessionOpts extends PrescribeOptions {
  layoffWarmupHeavy?: BarbellLiftId[];
  workout?: 'A' | 'B';
  spinMinutes?: number;
  stopped?: boolean;
}

export interface CondOpts {
  minutes?: number;
  target?: number;
  intervals?: number;
  shortNight?: boolean;
  stopped?: boolean;
  equipmentDown?: EquipmentDown[];
}

type SetupOpts = Partial<SetupAnswers> & {
  squat?: TableRating;
  press?: TableRating;
  deadlift?: TableRating;
};

// ------------------------------------------------------------ the log

export class Log {
  events: AnyEvent[] = [];
  settings: Partial<Settings>;
  lastPlan: SessionPlan | null = null;
  private n = 0;

  constructor(settings: Partial<Settings> = {}) {
    this.settings = settings;
  }

  stamp() {
    this.n += 1;
    const ts = new Date(Date.UTC(2026, 9, 1) + this.n * 1000).toISOString();
    return { id: `e${this.n}`, createdAt: ts, updatedAt: ts };
  }

  input(today?: LocalDate): EngineInput {
    const last = this.events.reduce<LocalDate>((d, e) => (e.date > d ? e.date : d), START);
    return { program: PROGRAM, settings: this.settings, events: [...this.events], today: today ?? last };
  }

  // ---- events

  setup(answers: SetupOpts = {}, setupDate: LocalDate = '2026-11-03'): this {
    const full: SetupAnswers = {
      ageBracket: answers.ageBracket ?? null,
      mondayEffort: {
        squat: answers.squat ?? answers.mondayEffort?.squat ?? 'rir3to4',
        press: answers.press ?? answers.mondayEffort?.press ?? 'rir1to2',
        deadlift: answers.deadlift ?? answers.mondayEffort?.deadlift ?? 'rir3to4',
      },
      chinSpare: answers.chinSpare ?? 2,
      barLb: answers.barLb,
      plates: answers.plates,
      assistFiveLbSteps: answers.assistFiveLbSteps,
      assistTwoPointFiveLbSteps: answers.assistTwoPointFiveLbSteps,
      pullChoice: answers.pullChoice,
      bodyweightLb: answers.bodyweightLb,
    };
    const evs = buildSetupEvents(PROGRAM, full, {
      setupDate,
      nowIso: this.stamp().createdAt,
      makeId: () => this.stamp().id,
    });
    this.events.push(...evs);
    return this;
  }

  lift(date: LocalDate, results: Results = {}, o: SessionOpts = {}): this {
    const plan = prescribe(this.input(date), date, {
      checkIns: o.checkIns,
      painAnswers: o.painAnswers,
      equipmentDown: o.equipmentDown,
    });
    this.lastPlan = plan;
    const lifts: LiftLog[] = [];
    for (const lift of BARBELL) {
      const outcome = results[lift];
      const lp = plan.lifts.find((l) => l.lift === lift);
      const answer = o.painAnswers?.[lift];
      if (!outcome) {
        if (answer) lifts.push({ lift, prescription: presFor(lift, lp, lp ? undefined : 0), sets: [], painAnswer: answer });
        continue;
      }
      lifts.push(buildLiftLog(lift, lp, outcome, o));
    }
    const ev: LiftingSessionEvent = {
      ...this.stamp(),
      type: 'liftingSession',
      date,
      workout: o.workout ?? plan.workout,
      weekType: plan.weekType,
      checkIns: o.checkIns ?? {},
      lifts,
      assist: buildAssist(plan, results.chin, results.dip),
      equipmentDown: o.equipmentDown,
      spinMinutes: o.spinMinutes,
      stopped: o.stopped,
    };
    this.events.push(ev);
    return this;
  }

  cond(date: LocalDate, o: CondOpts = {}): this {
    const cp = conditioningState(this.input(date), date, {
      shortNight: o.shortNight,
      targetMinutes: o.target,
      intervals: o.intervals,
      equipmentDown: o.equipmentDown,
    });
    const minutes = o.minutes ?? cp.targetMinutes;
    this.events.push({
      ...this.stamp(),
      type: 'conditioningSession',
      date,
      conditioningWeek: cp.conditioningWeek,
      phase: cp.phase,
      shortNight: o.shortNight ?? false,
      targetMinutes: o.target ?? cp.targetMinutes,
      actualMinutes: minutes,
      machines: { easy: cp.machines.easy, intervals: cp.machines.intervals ?? undefined },
      intervalsPlanned: cp.intervals,
      intervalsDone: minutes >= 30 ? cp.intervals : 0,
      stopped: o.stopped,
    });
    return this;
  }

  /** Extra easy minutes (RULES.md section 8, Q24). */
  extra(date: LocalDate, minutes: number): this {
    const cp = conditioningState(this.input(date), date, {});
    this.events.push({
      ...this.stamp(),
      type: 'conditioningSession',
      date,
      conditioningWeek: cp.conditioningWeek,
      phase: cp.phase,
      shortNight: false,
      targetMinutes: minutes,
      actualMinutes: minutes,
      machines: { easy: cp.machines.easy },
      intervalsPlanned: 0,
      intervalsDone: 0,
      extra: true,
    });
    return this;
  }

  /** Both conditioning sessions (Tuesday and Thursday) of the week starting `monday`. */
  condWeek(monday: LocalDate, o: CondOpts = {}): this {
    return this.cond(addDaysStr(monday, 1), o).cond(addDaysStr(monday, 3), o);
  }

  declare(date: LocalDate, kind: WeekDeclarationEvent['kind'], scope: WeekDeclarationEvent['scope'] = 'restOfWeek'): this {
    this.events.push({ ...this.stamp(), type: 'weekDeclaration', date, weekStart: mondayOf(date), kind, scope });
    return this;
  }

  illness(date: LocalDate, symptoms: boolean): this {
    this.events.push({ ...this.stamp(), type: 'illness', date, kind: 'start', symptoms });
    return this;
  }

  better(date: LocalDate): this {
    this.events.push({ ...this.stamp(), type: 'illness', date, kind: 'better' });
    return this;
  }

  floorWeek(date: LocalDate, change: 'added' | 'removed', weekStartDate: LocalDate): this {
    this.events.push({
      ...this.stamp(),
      type: change === 'added' ? 'floorWeekAdded' : 'floorWeekRemoved',
      date,
      weekStart: weekStartDate,
    });
    return this;
  }

  bodyweight(date: LocalDate, pounds: number): this {
    this.events.push({ ...this.stamp(), type: 'bodyweight', date, pounds });
    return this;
  }

  setting<K extends keyof Settings>(date: LocalDate, key: K, value: Settings[K]): this {
    this.events.push({ ...this.stamp(), type: 'settingsChange', date, key, oldValue: null, newValue: value });
    return this;
  }

  override(
    date: LocalDate,
    lift: OverrideEvent['lift'],
    field: OverrideEvent['field'],
    value: number,
    extra: { sets?: number; reps?: number; reason?: string } = {},
  ): this {
    this.events.push({
      ...this.stamp(),
      type: 'override',
      date,
      lift,
      field,
      value,
      sets: extra.sets,
      reps: extra.reps,
      reason: extra.reason ?? 'test',
    });
    return this;
  }

  foodLever(date: LocalDate, lift: BarbellLiftId, answer: boolean): this {
    this.events.push({ ...this.stamp(), type: 'foodLeverAnswer', date, lift, answer });
    return this;
  }

  painCleared(date: LocalDate, lift: BarbellLiftId, how: 'gone' | 'clinician'): this {
    this.events.push({ ...this.stamp(), type: 'painCleared', date, lift, how });
    return this;
  }

  ack(date: LocalDate, context: 'intervals' | 'settings' = 'intervals'): this {
    this.events.push({ ...this.stamp(), type: 'screeningAcknowledged', date, context });
    return this;
  }

  /** "No time today" (RULES.md section 1). */
  skip(date: LocalDate, kind: 'lifting' | 'conditioning'): this {
    this.events.push({ ...this.stamp(), type: 'skip', date, kind, reason: 'time' });
    return this;
  }

  dismiss(date: LocalDate, suggestion: SuggestionKind, lift?: BarbellLiftId | AssistLiftId): this {
    this.events.push({ ...this.stamp(), type: 'suggestionDismissed', date, suggestion, lift });
    return this;
  }

  // ---- history edits

  sessionOn(date: LocalDate): LiftingSessionEvent {
    const ev = this.events.find((e): e is LiftingSessionEvent => e.type === 'liftingSession' && e.date === date);
    if (!ev) throw new Error(`No lifting session on ${date}`);
    return ev;
  }

  edit<T extends AnyEvent>(ev: T, mutate: (e: T) => void): this {
    const i = this.events.indexOf(ev);
    const copy = structuredClone(ev);
    mutate(copy);
    this.events[i] = copy;
    return this;
  }

  remove(ev: AnyEvent): this {
    this.events = this.events.filter((e) => e !== ev);
    return this;
  }

  // ---- queries

  plan(date: LocalDate, o: PrescribeOptions = {}): SessionPlan {
    return prescribe(this.input(date), date, o);
  }

  liftPlan(date: LocalDate, lift: BarbellLiftId, o: PrescribeOptions = {}): LiftPlan {
    const lp = this.plan(date, o).lifts.find((l) => l.lift === lift);
    if (!lp) throw new Error(`${lift} not in the ${date} plan`);
    return lp;
  }

  day(date: LocalDate, today?: LocalDate) {
    return planFor(this.input(today ?? date), date);
  }

  state(lift: BarbellLiftId, today?: LocalDate) {
    return liftStates(this.input(today))[lift];
  }

  assist(lift: AssistLiftId, today?: LocalDate) {
    return assistStates(this.input(today))[lift];
  }

  cplan(date: LocalDate, o: Parameters<typeof conditioningState>[2] = {}) {
    return conditioningState(this.input(date), date, o);
  }

  week(monday: LocalDate, today?: LocalDate) {
    return weekSummary(this.input(today ?? monday), monday);
  }

  suggestions(today?: LocalDate) {
    return triggers(this.input(today));
  }

  program(today?: LocalDate) {
    return programState(this.input(today));
  }

  choices(lift: BarbellLiftId, today?: LocalDate) {
    return jumpChoices(this.input(today), lift);
  }
}

/** A log seeded by first-launch setup (RULES.md section 17) unless `setup: false`. */
export function buildLog(o: { setup?: SetupOpts | false; settings?: Partial<Settings> } = {}): Log {
  const log = new Log(o.settings ?? {});
  if (o.setup !== false) log.setup(o.setup ?? {});
  return log;
}

// ------------------------------------------------------------ builders

function addDaysStr(date: LocalDate, days: number): LocalDate {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function mondayOf(date: LocalDate): LocalDate {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const wd = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  return addDaysStr(date, -wd);
}

export { addDaysStr as plusDays, mondayOf };

function presFor(lift: BarbellLiftId, lp: LiftPlan | undefined, weight: number | undefined): LiftLog['prescription'] {
  if (lp) return { kind: lp.kind, weight: lp.weight, sets: lp.sets, reps: lp.reps };
  if (weight === undefined) throw new Error(`${lift} isn't in this session's plan; give it a weight`);
  const [sets, reps] = NORMAL_SCHEME[lift];
  return { kind: 'heavy', weight, sets, reps };
}

function defaultEffort(lift: BarbellLiftId): EffortRating {
  return lift === 'row' || lift === 'powerClean' ? 'crisp' : 'rir1to2';
}

const RATED_KINDS = new Set(['heavy', 'calibration']);

function buildLiftLog(lift: BarbellLiftId, lp: LiftPlan | undefined, out: LiftOutcome, o: SessionOpts): LiftLog {
  const weightArg = 'weight' in out ? out.weight : undefined;
  const pres = presFor(lift, lp, weightArg);
  const log: LiftLog = { lift, prescription: pres, sets: [] };
  const answer = o.painAnswers?.[lift];
  if (answer) log.painAnswer = answer;
  const heavyWarmup = o.layoffWarmupHeavy?.includes(lift) ?? false;
  if (heavyWarmup) log.layoffWarmupHeavy = true;
  const rated = RATED_KINDS.has(pres.kind);
  const baseWeight = heavyWarmup && lp?.layoffHeavyWeight ? lp.layoffHeavyWeight : pres.weight;
  const set = (weight: number, reps: number) => ({ weight, reps });

  switch (out.t) {
    case 'made': {
      const w = out.weight ?? baseWeight;
      log.sets = Array.from({ length: pres.sets }, () => set(w, pres.reps));
      if (rated) log.effort = out.effort ?? defaultEffort(lift);
      break;
    }
    case 'missed': {
      const w = out.weight ?? baseWeight;
      const reps = out.reps ?? Array.from({ length: pres.sets }, (_, i) => (i === pres.sets - 1 ? pres.reps - 1 : pres.reps));
      log.sets = reps.map((r) => set(w, r));
      if (rated) log.effort = 'missed';
      break;
    }
    case 'formBroke': {
      const w = out.weight ?? baseWeight;
      log.sets = Array.from({ length: pres.sets }, (_, i) => ({ ...set(w, pres.reps), formBroke: i === pres.sets - 1 }));
      if (rated) log.effort = 'missed';
      break;
    }
    case 'skipped': {
      const w = out.weight ?? baseWeight;
      log.sets = Array.from({ length: pres.sets }, (_, i) =>
        i < out.madeSets ? set(w, pres.reps) : { weight: w, reps: 0, skipped: true },
      );
      break;
    }
    case 'notReached':
      log.notReached = true;
      break;
    case 'painStop':
      log.sets = Array.from({ length: out.afterSets }, () => set(baseWeight, pres.reps));
      log.painStop = true;
      break;
    case 'calibrate': {
      const cal = lp?.calibration;
      const repsPerSet = cal?.repsPerSet ?? pres.reps;
      const workSets = cal?.workSets ?? pres.sets;
      const ramp = out.ramp.map(([weight, verdict], i) => ({
        weight,
        verdict,
        reps: out.lastMissed && i === out.ramp.length - 1 ? repsPerSet - 1 : repsPerSet,
      }));
      log.calibration = { sets: ramp };
      const last = out.ramp[out.ramp.length - 1];
      const prev = out.ramp[out.ramp.length - 2];
      if (!last) throw new Error('calibrate() needs at least one set');
      if (out.lastMissed) {
        const w = prev ? prev[0] : last[0];
        const fresh = lift === 'powerClean' ? 5 : 3;
        log.sets = Array.from({ length: fresh }, () => set(w, repsPerSet));
        log.prescription = { ...pres, weight: w, sets: fresh, reps: repsPerSet };
      } else {
        log.sets = Array.from({ length: workSets }, () => set(last[0], repsPerSet));
        log.prescription = { ...pres, weight: last[0], sets: workSets, reps: repsPerSet };
      }
      log.effort = out.effort ?? defaultEffort(lift);
      break;
    }
  }
  return log;
}

function buildAssist(
  plan: SessionPlan,
  chin: AssistOutcome | undefined,
  dip: AssistOutcome | undefined,
): LiftingSessionEvent['assist'] {
  if (!plan.assist || (!chin && !dip)) return undefined;
  const out: NonNullable<LiftingSessionEvent['assist']> = {};
  for (const [lift, outcome] of [['chin', chin], ['dip', dip]] as const) {
    const mp = plan.assist[lift];
    if (!mp || !outcome) continue;
    const base: AssistMovementLog = {
      kind: mp.kind,
      assistance: mp.assistance,
      addedLoad: mp.addedLoad,
      targetReps: [...mp.targetReps],
      reps: [...mp.targetReps],
      negativesDone: mp.negatives > 0,
    };
    switch (outcome.t) {
      case 'made':
        base.spare = outcome.spare;
        break;
      case 'missed':
        base.reps = outcome.reps ?? mp.targetReps.map((r, i) => (i === mp.targetReps.length - 1 ? r - 1 : r));
        base.spare = 0;
        break;
      case 'reps':
        base.reps = outcome.reps;
        base.spare = outcome.spare ?? 0;
        break;
      case 'calibrate': {
        const start = mp.calibration?.start ?? mp.assistance;
        const ramp: { assistance: number; reps: number }[] = [];
        for (let a = start; a > outcome.setting; a -= a - 10 >= outcome.setting ? 10 : a - outcome.setting) {
          ramp.push({ assistance: a, reps: 5 });
        }
        ramp.push({ assistance: outcome.setting, reps: 5 });
        base.calibration = { sets: ramp, setting: outcome.setting };
        base.assistance = outcome.setting;
        base.addedLoad = 0;
        base.targetReps = [5, 5, 5];
        base.reps = [5, 5, 5];
        base.spare = outcome.spare;
        break;
      }
    }
    out[lift] = base;
  }
  return out;
}
