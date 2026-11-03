// The lifting session draft (SPEC.md sections 3 and 5.3). The screen keeps
// every tap here, saves it to IndexedDB as a draft, and turns it into one
// liftingSession event at Finish, so a half-logged session never changes the
// plan. Pure: no DOM and no clock. Timestamps come in as arguments.

import {
  dipCalibrationNext,
  prescribe,
  rampResult,
  type AssistLiftId,
  type AssistMovementLog,
  type AssistMovementPlan,
  type BarbellLiftId,
  type CalibrationVerdict,
  type CheckIns,
  type EffortRating,
  type EngineInput,
  type EquipmentDown,
  type IsoTimestamp,
  type LiftLog,
  type LiftPlan,
  type LiftingSessionEvent,
  type LocalDate,
  type SessionPlan,
  type SessionProgress,
  type SpareReps,
  type SubstitutionLog,
  type TimerState,
} from '../../engine';

export const LIFTING_DRAFT_VERSION = 1;

export type SetState = 'todo' | 'done' | 'skipped';

export interface SetDraft {
  state: SetState;
  reps: number;
  formBroke: boolean;
}

export interface RampSetDraft {
  weight: number;
  reps: number;
  verdict: CalibrationVerdict;
}

export interface LiftDraft {
  lift: BarbellLiftId;
  warmups: boolean[];
  /** The 22-to-60-day return: "Did that warm-up feel heavy?" */
  layoffHeavy: boolean | null;
  /** A weight other than the prescription (RULES.md section 3, logged weights rule). */
  weight: number | null;
  sets: SetDraft[];
  effort: EffortRating | null;
  painStop: boolean;
  /** Calibration: the ramp sets so far, and the reps on the set being done. */
  ramp: RampSetDraft[];
  rampReps: number | null;
}

export interface AssistRowDraft {
  lift: AssistLiftId;
  reps: number;
  done: boolean;
}

/** Dip calibration, and both movements after a layoff of more than 60 days (RULES.md sections 9 and 11). */
export interface AssistCalibrationDraft {
  sets: { assistance: number; reps: number }[];
  /** Set once "5 solid with 2 or 3 to spare." */
  setting: number | null;
  /** Assistance for the next calibration set. */
  current: number;
  reps: number;
}

export interface TimerDraft extends TimerState {
  label: string;
}

export type CheckInId = 'lastNightUnder6' | 'mostNightsUnder7' | 'jointPain' | 'flatFromIntervals';

export interface LiftingDraft {
  v: typeof LIFTING_DRAFT_VERSION;
  kind: 'lifting';
  date: LocalDate;
  /** A past-date entry (RULES.md section 17): no clock, no rest timer. */
  past: boolean;
  step: 'checkIn' | 'lifting' | 'finish';
  startedAt: IsoTimestamp | null;
  /** Start check-in answers. Unanswered questions are absent. */
  answers: Partial<Record<CheckInId, boolean>>;
  jointPainLifts: BarbellLiftId[];
  painAnswers: Partial<Record<BarbellLiftId, 'gone' | 'stillThere'>>;
  equipmentDown: EquipmentDown[];
  bikeDone: boolean;
  lifts: Partial<Record<BarbellLiftId, LiftDraft>>;
  assistRows: AssistRowDraft[] | null;
  spare: Partial<Record<AssistLiftId, SpareReps>>;
  negatives: [boolean, boolean];
  assistCalibration: Partial<Record<AssistLiftId, AssistCalibrationDraft>>;
  /** Reps per set for each substitution, by exercise. */
  substitutions: Record<string, (number | null)[]>;
  spinDone: boolean;
  timer: TimerDraft | null;
  cutsApplied: number;
  warmupsHeavy: boolean | null;
  notes: string;
}

export function newLiftingDraft(date: LocalDate, past: boolean): LiftingDraft {
  return {
    v: LIFTING_DRAFT_VERSION,
    kind: 'lifting',
    date,
    past,
    step: 'checkIn',
    startedAt: null,
    answers: {},
    jointPainLifts: [],
    painAnswers: {},
    equipmentDown: [],
    bikeDone: false,
    lifts: {},
    assistRows: null,
    spare: {},
    negatives: [false, false],
    assistCalibration: {},
    substitutions: {},
    spinDone: false,
    timer: null,
    cutsApplied: 0,
    warmupsHeavy: null,
    notes: '',
  };
}

// ------------------------------------------------------------ the plan

export function checkInsOf(d: LiftingDraft): CheckIns {
  const c: CheckIns = {};
  if (d.answers.lastNightUnder6 !== undefined) c.lastNightUnder6 = d.answers.lastNightUnder6;
  if (d.answers.mostNightsUnder7 !== undefined) c.mostNightsUnder7 = d.answers.mostNightsUnder7;
  if (d.answers.jointPain) c.jointPain = [...d.jointPainLifts];
  if (d.answers.flatFromIntervals !== undefined) c.flatFromIntervals = d.answers.flatFromIntervals;
  if (d.warmupsHeavy !== null) c.warmupsHeavy = d.warmupsHeavy;
  return c;
}

/** The session's plan, from the log plus this draft's check-ins, pain answers, and equipment. */
export function sessionPlan(input: EngineInput, d: LiftingDraft): SessionPlan {
  return prescribe(input, d.date, { checkIns: checkInsOf(d), painAnswers: d.painAnswers, equipmentDown: d.equipmentDown });
}

// ------------------------------------------------------------ lifts

const RATED = new Set(['heavy', 'calibration']);
const CLEAN_ROW = new Set<BarbellLiftId>(['powerClean', 'row']);

export const isRated = (lp: LiftPlan): boolean => RATED.has(lp.kind);
export const ratesCrisp = (lift: BarbellLiftId): boolean => CLEAN_ROW.has(lift);

function freshSets(n: number, reps: number): SetDraft[] {
  return Array.from({ length: n }, () => ({ state: 'todo' as const, reps, formBroke: false }));
}

/** The lift's draft, or a fresh one from its plan. */
export function liftDraft(d: LiftingDraft, lp: LiftPlan): LiftDraft {
  const existing = d.lifts[lp.lift];
  if (existing) return existing;
  return {
    lift: lp.lift,
    warmups: lp.warmups.map(() => false),
    layoffHeavy: null,
    weight: null,
    sets: lp.kind === 'calibration' ? [] : freshSets(lp.sets, lp.reps),
    effort: null,
    painStop: false,
    ramp: [],
    rampReps: lp.calibration ? lp.calibration.repsPerSet : null,
  };
}

function withLift(d: LiftingDraft, lp: LiftPlan, edit: (l: LiftDraft) => LiftDraft): LiftingDraft {
  return { ...d, lifts: { ...d.lifts, [lp.lift]: edit(liftDraft(d, lp)) } };
}

/** The weight his work sets use: his change, the heavy-warm-up drop, or the prescription. */
export function workWeightOf(lp: LiftPlan, l: LiftDraft): number {
  if (l.weight !== null) return l.weight;
  if (l.layoffHeavy && lp.layoffHeavyWeight !== null) return lp.layoffHeavyWeight;
  if (lp.kind === 'calibration') return calibratedWeight(lp, l) ?? lp.weight;
  return lp.weight;
}

export function toggleWarmup(d: LiftingDraft, lp: LiftPlan, i: number): LiftingDraft {
  return withLift(d, lp, (l) => ({ ...l, warmups: l.warmups.map((v, j) => (j === i ? !v : v)) }));
}

export function answerLayoffHeavy(d: LiftingDraft, lp: LiftPlan, heavy: boolean): LiftingDraft {
  return withLift(d, lp, (l) => ({ ...l, layoffHeavy: heavy }));
}

export function setWorkWeight(d: LiftingDraft, lp: LiftPlan, weight: number | null): LiftingDraft {
  return withLift(d, lp, (l) => ({ ...l, weight }));
}

function editSet(d: LiftingDraft, lp: LiftPlan, i: number, edit: (s: SetDraft) => SetDraft): LiftingDraft {
  return withLift(d, lp, (l) => ({ ...l, sets: l.sets.map((s, j) => (j === i ? edit(s) : s)) }));
}

/** One tap logs the set as made. A second tap takes it back. */
export function tapSet(d: LiftingDraft, lp: LiftPlan, i: number): LiftingDraft {
  return editSet(d, lp, i, (s) =>
    s.state === 'done' ? { ...s, state: 'todo', reps: lp.reps, formBroke: false } : { ...s, state: 'done' },
  );
}

/** The minus button: a short set. */
export function lowerReps(d: LiftingDraft, lp: LiftPlan, i: number): LiftingDraft {
  return editSet(d, lp, i, (s) => ({ ...s, state: 'done', reps: Math.max(0, (s.state === 'done' ? s.reps : lp.reps) - 1) }));
}

export function toggleFormBroke(d: LiftingDraft, lp: LiftPlan, i: number): LiftingDraft {
  return editSet(d, lp, i, (s) => ({ ...s, state: 'done', formBroke: !s.formBroke }));
}

/** The long press: skipped, because he had to leave or time ran out. */
export function toggleSkipped(d: LiftingDraft, lp: LiftPlan, i: number): LiftingDraft {
  return editSet(d, lp, i, (s) => ({ ...s, state: s.state === 'skipped' ? 'todo' : 'skipped', reps: lp.reps, formBroke: false }));
}

export function setEffort(d: LiftingDraft, lp: LiftPlan, effort: EffortRating | null): LiftingDraft {
  return withLift(d, lp, (l) => ({ ...l, effort }));
}

export function togglePainStop(d: LiftingDraft, lp: LiftPlan): LiftingDraft {
  return withLift(d, lp, (l) => ({ ...l, painStop: !l.painStop }));
}

/** Any attempted set came up short or had a rep marked "form broke" (RULES.md section 0). */
export function liftMissed(lp: LiftPlan, l: LiftDraft): boolean {
  return l.sets.some((s) => s.state === 'done' && (s.reps < targetReps(lp) || s.formBroke));
}

function targetReps(lp: LiftPlan): number {
  return lp.calibration ? lp.calibration.repsPerSet : lp.reps;
}

/** Every work set has been logged one way or another. */
export function workSetsFinished(lp: LiftPlan, l: LiftDraft): boolean {
  if (lp.kind === 'calibration' && calibratedWeight(lp, l) === null) return false;
  return l.sets.length > 0 && l.sets.every((s) => s.state !== 'todo');
}

/** The effort chips show after the last work set, unless a set came up short. */
export function wantsRating(lp: LiftPlan, l: LiftDraft): boolean {
  return isRated(lp) && !l.painStop && workSetsFinished(lp, l) && l.sets.some((s) => s.state === 'done') && !liftMissed(lp, l);
}

/** Lifts that still need an effort rating before the session can finish. */
export function missingRatings(plan: SessionPlan, d: LiftingDraft): LiftPlan[] {
  return plan.lifts.filter((lp) => {
    const l = d.lifts[lp.lift];
    if (!l || !wantsRating(lp, l)) return false;
    const allMade = l.sets.every((s) => s.state === 'done');
    return allMade && l.effort === null;
  });
}

// ------------------------------------------------------------ calibration (bench, rows, cleans)

/** The weight for the ramp set being done now: +20 after "Fast," +10 after "Starting to slow" (section 9). */
export function nextRampWeight(lp: LiftPlan, l: LiftDraft): number {
  const cal = lp.calibration!;
  const last = l.ramp[l.ramp.length - 1];
  if (!last) return cal.startWeight;
  return last.weight + (last.verdict === 'fast' ? cal.stepFast : cal.stepSlowing);
}

/** The work weight once the ramp has clearly slowed, or null while it's still going. */
export function calibratedWeight(lp: LiftPlan, l: LiftDraft): number | null {
  return rampOutcome(lp, l)?.workWeight ?? null;
}

function rampOutcome(lp: LiftPlan, l: LiftDraft) {
  const cal = lp.calibration;
  return cal ? rampResult(l.ramp, cal.repsPerSet, cal.workSets) : null;
}

export function lowerRampReps(d: LiftingDraft, lp: LiftPlan, delta: number): LiftingDraft {
  const max = lp.calibration!.repsPerSet;
  return withLift(d, lp, (l) => ({ ...l, rampReps: Math.max(0, Math.min(max, (l.rampReps ?? max) + delta)) }));
}

/**
 * Log the ramp set with its verdict. A short set always counts as clearly
 * slowed. Once it slows, the work sets follow: the slowed set is the first of
 * them, or, if it missed reps, fresh sets follow at the weight before it.
 */
export function rampVerdict(d: LiftingDraft, lp: LiftPlan, verdict: CalibrationVerdict): LiftingDraft {
  const cal = lp.calibration!;
  return withLift(d, lp, (l) => {
    const reps = l.rampReps ?? cal.repsPerSet;
    const v: CalibrationVerdict = reps < cal.repsPerSet ? 'slowed' : verdict;
    const ramp = [...l.ramp, { weight: nextRampWeight(lp, l), reps, verdict: v }];
    const next: LiftDraft = { ...l, ramp, rampReps: cal.repsPerSet };
    if (v !== 'slowed') return next;
    const found = rampOutcome(lp, next)!;
    const sets = freshSets(found.rampSetIsFirstWorkSet ? found.workSetsRemaining + 1 : found.workSetsRemaining, cal.repsPerSet);
    if (found.rampSetIsFirstWorkSet) sets[0] = { state: 'done', reps, formBroke: false };
    return { ...next, sets };
  });
}

/** Take back the last ramp set. */
export function undoRamp(d: LiftingDraft, lp: LiftPlan): LiftingDraft {
  return withLift(d, lp, (l) => ({ ...l, ramp: l.ramp.slice(0, -1), sets: [], effort: null, rampReps: lp.calibration!.repsPerSet }));
}

// ------------------------------------------------------------ chins and dips

/** Six rows alternating chin and dip (three when split). */
export function assistRows(plan: SessionPlan, d: LiftingDraft): AssistRowDraft[] {
  const a = plan.assist;
  if (!a || a.substitutions) return [];
  const movements = [a.chin, a.dip].filter((m): m is AssistMovementPlan => m !== null);
  const fresh: AssistRowDraft[] = [];
  for (let r = 0; r < a.rounds; r++) for (const m of movements) fresh.push({ lift: m.lift, reps: m.targetReps[r] ?? 5, done: false });
  const saved = d.assistRows;
  if (saved && saved.length === fresh.length && saved.every((x, i) => x.lift === fresh[i]!.lift)) return saved;
  return fresh;
}

/** The assistance each round uses: the calibrated setting when there was a calibration. */
export function assistSetting(m: AssistMovementPlan, d: LiftingDraft): number {
  return d.assistCalibration[m.lift]?.setting ?? m.assistance;
}

export function assistCalibrationDraft(m: AssistMovementPlan, d: LiftingDraft): AssistCalibrationDraft {
  return d.assistCalibration[m.lift] ?? { sets: [], setting: null, current: m.calibration?.start ?? m.assistance, reps: 5 };
}

export function assistCalibrationNeeded(m: AssistMovementPlan, d: LiftingDraft): boolean {
  return m.calibration !== null && assistCalibrationDraft(m, d).setting === null;
}

/** One calibration set: take off 10 (or 5 once close), or settle with 2 or 3 to spare. */
export function assistCalibrationStep(
  d: LiftingDraft,
  m: AssistMovementPlan,
  step: 'more' | 'close' | 'settle',
): LiftingDraft {
  const c = assistCalibrationDraft(m, d);
  const sets = [...c.sets, { assistance: c.current, reps: c.reps }];
  const next: AssistCalibrationDraft =
    step === 'settle'
      ? { ...c, sets, setting: c.current }
      : { ...c, sets, current: dipCalibrationNext(c.current, step === 'close'), reps: 5 };
  return { ...d, assistCalibration: { ...d.assistCalibration, [m.lift]: next } };
}

export function assistCalibrationReps(d: LiftingDraft, m: AssistMovementPlan, delta: number): LiftingDraft {
  const c = assistCalibrationDraft(m, d);
  return { ...d, assistCalibration: { ...d.assistCalibration, [m.lift]: { ...c, reps: Math.max(0, Math.min(5, c.reps + delta)) } } };
}

export function undoAssistCalibration(d: LiftingDraft, m: AssistMovementPlan): LiftingDraft {
  const rest = { ...d.assistCalibration };
  delete rest[m.lift];
  return { ...d, assistCalibration: rest };
}

export function tapAssistRow(plan: SessionPlan, d: LiftingDraft, i: number): LiftingDraft {
  const rows = assistRows(plan, d).map((r, j) => (j === i ? { ...r, done: !r.done } : r));
  return { ...d, assistRows: rows };
}

export function assistRowReps(plan: SessionPlan, d: LiftingDraft, i: number, delta: number): LiftingDraft {
  const rows = assistRows(plan, d).map((r, j) => (j === i ? { ...r, reps: Math.max(0, Math.min(20, r.reps + delta)), done: true } : r));
  return { ...d, assistRows: rows };
}

/**
 * Movements whose sets are all done but whose spare reps aren't answered. The
 * engine would read no answer as 0 to spare, so Finish asks first.
 */
export function missingSpare(plan: SessionPlan, d: LiftingDraft): AssistMovementPlan[] {
  const a = plan.assist;
  if (!a || a.substitutions) return [];
  const rows = assistRows(plan, d);
  return [a.chin, a.dip].filter((m): m is AssistMovementPlan => {
    if (!m) return false;
    const mine = rows.filter((r) => r.lift === m.lift);
    return mine.length > 0 && mine.every((r) => r.done) && d.spare[m.lift] === undefined;
  });
}

export function setSpare(d: LiftingDraft, lift: AssistLiftId, spare: SpareReps): LiftingDraft {
  return { ...d, spare: { ...d.spare, [lift]: spare } };
}

export function toggleNegative(d: LiftingDraft, i: 0 | 1): LiftingDraft {
  const negatives: [boolean, boolean] = [...d.negatives];
  negatives[i] = !negatives[i];
  return { ...d, negatives };
}

export function substitutionReps(d: LiftingDraft, exercise: string, sets: number): (number | null)[] {
  const saved = d.substitutions[exercise];
  return saved && saved.length === sets ? saved : Array.from({ length: sets }, () => null);
}

export function setSubstitutionReps(d: LiftingDraft, exercise: string, sets: number, i: number, reps: number | null): LiftingDraft {
  const list = substitutionReps(d, exercise, sets).map((r, j) => (j === i ? reps : r));
  return { ...d, substitutions: { ...d.substitutions, [exercise]: list } };
}

// ------------------------------------------------------------ rest timer

export function startTimer(d: LiftingDraft, label: string, durationSec: number, now: IsoTimestamp): LiftingDraft {
  if (d.past) return d;
  return { ...d, timer: { startedAt: now, durationSec, adjustSec: 0, label } };
}

export function adjustTimer(d: LiftingDraft, deltaSec: number): LiftingDraft {
  return d.timer ? { ...d, timer: { ...d.timer, adjustSec: d.timer.adjustSec + deltaSec } } : d;
}

export function clearTimer(d: LiftingDraft): LiftingDraft {
  return { ...d, timer: null };
}

// ------------------------------------------------------------ progress and finish

export function progressOf(plan: SessionPlan, d: LiftingDraft): SessionProgress {
  const warmupsDone: SessionProgress['warmupsDone'] = {};
  const workSetsDone: SessionProgress['workSetsDone'] = {};
  for (const lp of plan.lifts) {
    const l = d.lifts[lp.lift];
    if (!l) continue;
    warmupsDone[lp.lift] = l.warmups.filter(Boolean).length;
    workSetsDone[lp.lift] = l.painStop ? lp.sets : l.sets.filter((s) => s.state !== 'todo').length;
  }
  const assistDone =
    assistRows(plan, d).filter((r) => r.done).length + Object.values(d.substitutions).flat().filter((r) => r !== null).length;
  return { bikeDone: d.bikeDone, warmupsDone, workSetsDone, assistSetsDone: assistDone, spinDone: d.spinDone };
}

function liftLog(lp: LiftPlan, l: LiftDraft | undefined, painAnswer: 'gone' | 'stillThere' | undefined): LiftLog {
  const base: LiftLog = { lift: lp.lift, prescription: { kind: lp.kind, weight: lp.weight, sets: lp.sets, reps: lp.reps }, sets: [] };
  if (painAnswer) base.painAnswer = painAnswer;
  if (!l) return { ...base, notReached: true };
  const W = workWeightOf(lp, l);
  const log: LiftLog = { ...base, warmupsDone: l.warmups.filter(Boolean).length };
  if (l.layoffHeavy !== null && lp.layoffHeavyWeight !== null) log.layoffWarmupHeavy = l.layoffHeavy;
  if (lp.kind === 'calibration') {
    const found = rampOutcome(lp, l);
    log.calibration = { sets: l.ramp.map((s) => ({ ...s })) };
    if (found) log.prescription = { kind: 'calibration', weight: found.workWeight, sets: l.sets.length, reps: lp.calibration!.repsPerSet };
  }
  const touched = l.sets.some((s) => s.state !== 'todo');
  if (!touched && !l.painStop && l.ramp.length === 0) return { ...log, notReached: true };
  if (l.painStop) {
    log.painStop = true;
    log.sets = l.sets.filter((s) => s.state === 'done').map((s) => setLog(W, s));
    return log;
  }
  // Untouched sets at Finish were never done: they count as skipped, not missed (section 4).
  log.sets = l.sets.map((s) => (s.state === 'done' ? setLog(W, s) : { weight: W, reps: 0, skipped: true }));
  if (isRated(lp) && log.sets.some((s) => !s.skipped)) {
    if (liftMissed(lp, l)) log.effort = 'missed';
    else if (l.effort && l.effort !== 'missed') log.effort = l.effort;
  }
  return log;
}

function setLog(weight: number, s: SetDraft) {
  return { weight, reps: s.reps, ...(s.formBroke ? { formBroke: true } : {}) };
}

function assistLog(m: AssistMovementPlan, d: LiftingDraft, rows: AssistRowDraft[]): AssistMovementLog | undefined {
  const mine = rows.filter((r) => r.lift === m.lift);
  const cal = d.assistCalibration[m.lift];
  if (!mine.some((r) => r.done) && !cal) return undefined;
  const log: AssistMovementLog = {
    kind: m.kind,
    assistance: cal?.setting ?? m.assistance,
    addedLoad: cal?.setting !== undefined && cal.setting !== null ? 0 : m.addedLoad,
    targetReps: cal?.setting !== undefined && cal.setting !== null ? m.targetReps.map(() => 5) : [...m.targetReps],
    reps: mine.map((r) => (r.done ? r.reps : 0)),
  };
  const spare = d.spare[m.lift];
  if (spare !== undefined) log.spare = spare;
  if (m.negatives > 0) log.negativesDone = d.negatives.every(Boolean);
  if (cal && cal.setting !== null) log.calibration = { sets: cal.sets.map((s) => ({ ...s })), setting: cal.setting };
  return log;
}

export type NewLiftingSession = Omit<LiftingSessionEvent, 'id' | 'createdAt' | 'updatedAt'>;

/** The one event Finish saves. */
export function toLiftingEvent(plan: SessionPlan, d: LiftingDraft, opts: { endedAt?: IsoTimestamp; stopped?: boolean } = {}): NewLiftingSession {
  const lifts: LiftLog[] = plan.lifts.map((lp) => liftLog(lp, d.lifts[lp.lift], d.painAnswers[lp.lift]));
  for (const p of plan.paused) {
    const answer = d.painAnswers[p.lift];
    if (answer) lifts.push({ lift: p.lift, prescription: { kind: 'heavy', weight: 0, sets: 0, reps: 0 }, sets: [], painAnswer: answer });
  }
  const ev: NewLiftingSession = {
    type: 'liftingSession',
    date: d.date,
    workout: plan.workout,
    weekType: plan.weekType,
    checkIns: checkInsOf(d),
    lifts,
  };
  if (d.startedAt && !d.past) ev.startedAt = d.startedAt;
  if (opts.endedAt && !d.past) ev.endedAt = opts.endedAt;
  const a = plan.assist;
  if (a?.substitutions) {
    const subs: SubstitutionLog[] = a.substitutions
      .map((s) => ({ exercise: s.exercise, sets: s.sets, reps: substitutionReps(d, s.exercise, s.sets).map((r) => r ?? 0), replaces: s.replaces }))
      .filter((s) => s.reps.some((r) => r > 0));
    if (subs.length > 0) ev.substitutions = subs;
  } else if (a) {
    const rows = assistRows(plan, d);
    const assist: NonNullable<LiftingSessionEvent['assist']> = {};
    const chin = a.chin ? assistLog(a.chin, d, rows) : undefined;
    const dip = a.dip ? assistLog(a.dip, d, rows) : undefined;
    if (chin) assist.chin = chin;
    if (dip) assist.dip = dip;
    if (chin || dip) ev.assist = assist;
  }
  if (d.equipmentDown.length > 0) ev.equipmentDown = [...d.equipmentDown];
  if (plan.afterLiftingSpin && d.spinDone) ev.spinMinutes = plan.afterLiftingSpin.minutes;
  if (d.notes.trim()) ev.notes = d.notes.trim();
  if (opts.stopped) ev.stopped = true;
  return ev;
}
