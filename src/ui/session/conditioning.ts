// The conditioning session draft and its segmented timer (SPEC.md section
// 5.4). Pure: timestamps come in as arguments, and the timer is computed from
// them, never from counted ticks, so it stays right when iOS suspends the page.

import {
  conditioningState,
  type ConditioningPlan,
  type ConditioningSessionEvent,
  type EngineInput,
  type EquipmentDown,
  type IsoTimestamp,
  type LocalDate,
  type Program,
} from '../../engine';

export const CONDITIONING_DRAFT_VERSION = 1;

export interface ConditioningDraft {
  v: typeof CONDITIONING_DRAFT_VERSION;
  kind: 'conditioning';
  date: LocalDate;
  past: boolean;
  /** Left unfinished on an earlier day and reopened as a past entry. */
  fromEarlierDay?: boolean;
  /** Extra easy minutes (RULES.md section 8, Q24): no check-in and no intervals, and they count toward the weekly bar only. */
  extra?: boolean;
  step: 'checkIn' | 'setup' | 'running' | 'finish';
  shortNight: boolean | null;
  /** Null until he changes them: the plan's defaults. */
  targetMinutes: number | null;
  intervals: number | null;
  equipmentDown: EquipmentDown[];
  startedAt: IsoTimestamp | null;
  pausedAt: IsoTimestamp | null;
  pausedSec: number;
  actualMinutes: number | null;
  intervalsDone: number | null;
  notes: string;
}

/** Extra easy minutes start here, and the stepper runs between these. */
export const EXTRA_MINUTES = { start: 20, min: 5, max: 90 } as const;

export function newConditioningDraft(date: LocalDate, past: boolean, extra = false): ConditioningDraft {
  return {
    v: CONDITIONING_DRAFT_VERSION,
    kind: 'conditioning',
    date,
    past,
    ...(extra ? { extra: true } : {}),
    step: extra ? 'setup' : 'checkIn',
    shortNight: extra ? false : null,
    targetMinutes: null,
    intervals: null,
    equipmentDown: [],
    startedAt: null,
    pausedAt: null,
    pausedSec: 0,
    actualMinutes: null,
    intervalsDone: null,
    notes: '',
  };
}

export function conditioningPlanOf(input: EngineInput, d: ConditioningDraft): ConditioningPlan {
  if (d.extra) {
    // Easy minutes only, at whatever length he picks: the phase's range and intervals don't apply.
    const base = conditioningState(input, d.date, { shortNight: true, equipmentDown: d.equipmentDown });
    return {
      ...base,
      range: [EXTRA_MINUTES.min, EXTRA_MINUTES.max],
      minMinutes: EXTRA_MINUTES.min,
      targetMinutes: d.targetMinutes ?? EXTRA_MINUTES.start,
      intervals: 0,
      maxIntervals: 0,
      noIntervalsReason: null,
      layout: null,
      machines: { ...base.machines, intervals: null },
      screeningGate: false,
      layoffDrop: 'none',
    };
  }
  return conditioningState(input, d.date, {
    shortNight: d.shortNight ?? false,
    ...(d.targetMinutes !== null ? { targetMinutes: d.targetMinutes } : {}),
    ...(d.intervals !== null ? { intervals: d.intervals } : {}),
    equipmentDown: d.equipmentDown,
  });
}

export type SegmentKind = 'easy' | 'hard' | 'recover';

export interface Segment {
  kind: SegmentKind;
  sec: number;
  machine: string;
  /** Interval number, from 1, for hard and recovery segments. */
  round: number | null;
}

/** Easy on the air bike, the interval block, then easy to finish (RULES.md section 8). */
export function timeline(plan: ConditioningPlan, program: Program): Segment[] {
  const easy = plan.machines.easy;
  if (!plan.layout || plan.intervals === 0) return [{ kind: 'easy', sec: plan.targetMinutes * 60, machine: easy, round: null }];
  const { hardSec, easySec } = program.conditioning.interval;
  const block = plan.machines.intervals ?? easy;
  const segs: Segment[] = [{ kind: 'easy', sec: plan.layout.easyBeforeSec, machine: easy, round: null }];
  for (let i = 1; i <= plan.intervals; i++) {
    segs.push({ kind: 'hard', sec: hardSec, machine: block, round: i });
    segs.push({ kind: 'recover', sec: easySec, machine: block, round: i });
  }
  segs.push({ kind: 'easy', sec: plan.layout.easyAfterSec, machine: easy, round: null });
  return segs.filter((s) => s.sec > 0);
}

export function totalSec(segs: readonly Segment[]): number {
  return segs.reduce((t, s) => t + s.sec, 0);
}

/** Seconds of work so far, leaving out time spent paused. */
export function elapsedSec(d: ConditioningDraft, now: IsoTimestamp): number {
  if (!d.startedAt) return 0;
  const end = d.pausedAt ?? now;
  return Math.max(0, (Date.parse(end) - Date.parse(d.startedAt)) / 1000 - d.pausedSec);
}

export interface TimelinePosition {
  index: number;
  segment: Segment | null;
  remainingSec: number;
  next: Segment | null;
  finished: boolean;
  /** Hard segments fully done. */
  intervalsDone: number;
}

export function positionAt(segs: readonly Segment[], elapsed: number): TimelinePosition {
  let t = 0;
  let intervalsDone = 0;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i]!;
    if (elapsed < t + s.sec) {
      return { index: i, segment: s, remainingSec: t + s.sec - elapsed, next: segs[i + 1] ?? null, finished: false, intervalsDone };
    }
    if (s.kind === 'hard') intervalsDone += 1;
    t += s.sec;
  }
  return { index: segs.length, segment: null, remainingSec: 0, next: null, finished: true, intervalsDone };
}

export function start(d: ConditioningDraft, now: IsoTimestamp): ConditioningDraft {
  return { ...d, step: 'running', startedAt: d.startedAt ?? now, pausedAt: null };
}

/** Back to the Start screen at zero, for a timer started by mistake. The target and intervals he chose stay. */
export function restart(d: ConditioningDraft): ConditioningDraft {
  return { ...d, step: 'setup', startedAt: null, pausedAt: null, pausedSec: 0, actualMinutes: null, intervalsDone: null };
}

export function pause(d: ConditioningDraft, now: IsoTimestamp): ConditioningDraft {
  return d.pausedAt ? d : { ...d, pausedAt: now };
}

export function resume(d: ConditioningDraft, now: IsoTimestamp): ConditioningDraft {
  if (!d.pausedAt) return d;
  return { ...d, pausedAt: null, pausedSec: d.pausedSec + (Date.parse(now) - Date.parse(d.pausedAt)) / 1000 };
}

/** Move to Finish with actual minutes and intervals prefilled from the clock. */
export function finish(d: ConditioningDraft, plan: ConditioningPlan, program: Program, now: IsoTimestamp): ConditioningDraft {
  if (d.past || !d.startedAt) return { ...d, step: 'finish', actualMinutes: plan.targetMinutes, intervalsDone: plan.intervals };
  const segs = timeline(plan, program);
  const elapsed = elapsedSec(d, now);
  const pos = positionAt(segs, elapsed);
  const minutes = Math.min(plan.targetMinutes, Math.round(elapsed / 60));
  return { ...d, step: 'finish', pausedAt: d.pausedAt ?? now, actualMinutes: minutes, intervalsDone: pos.intervalsDone };
}

export type NewConditioningSession = Omit<ConditioningSessionEvent, 'id' | 'createdAt' | 'updatedAt'>;

export function toConditioningEvent(plan: ConditioningPlan, d: ConditioningDraft, opts: { stopped?: boolean } = {}): NewConditioningSession {
  const ev: NewConditioningSession = {
    type: 'conditioningSession',
    date: d.date,
    conditioningWeek: plan.conditioningWeek,
    phase: plan.phase,
    shortNight: d.shortNight ?? false,
    targetMinutes: plan.targetMinutes,
    actualMinutes: Math.max(0, d.actualMinutes ?? 0),
    machines: { easy: plan.machines.easy, ...(plan.machines.intervals ? { intervals: plan.machines.intervals } : {}) },
    intervalsPlanned: plan.intervals,
    intervalsDone: Math.max(0, Math.min(plan.intervals, d.intervalsDone ?? 0)),
  };
  if (d.notes.trim()) ev.notes = d.notes.trim();
  if (opts.stopped) ev.stopped = true;
  if (d.extra) ev.extra = true;
  return ev;
}
