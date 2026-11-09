// Day plans, week summaries, banners, and food lines (RULES.md sections 1, 10, 13; SPEC.md 5.2 and 5.5).

import { insideBreak, sickOn, weekKind, weekTypeOn } from './calendar';
import { conditioningPlan } from './conditioning';
import { addDays, programWeek, weekdayIndex, weekdayName, weekStart } from './dates';
import type { Banner, DayPlan, WeekSummary } from './planTypes';
import { formatLb } from './plates';
import { buildSessionPlan } from './prescribe';
import { BARBELL_LIFTS, liftNoun } from './programAccess';
import { READINGS } from './readings';
import { replay, replayEach } from './replay';
import { skipOn, slotSource } from './schedule';
import type { EngineState } from './state';
import type { EngineInput, LocalDate, PrescriptionKind, SuggestionKind, Workout } from './types';

const SUGGESTION_ORDER: SuggestionKind[] = ['lightWeek', 'foodLever', 'graduation', 'earlyStall'];

/** At most two show; the UI takes them in this order. */
export function bannersFor(st: EngineState, date: LocalDate): Banner[] {
  const program = st.program;
  const out: Banner[] = [];
  for (const lift of BARBELL_LIFTS) {
    if (st.lifts[lift].pain === 'paused') {
      out.push({ kind: 'painCheck', lift, message: program.safety.pausedLiftQuestion.replace('{lift}', liftNoun(program, lift)) });
    }
  }
  for (const kind of SUGGESTION_ORDER) {
    for (const s of st.suggestions.filter((x) => x.kind === kind)) out.push({ kind, message: s.message, lift: s.lift });
  }
  if (insideBreak(program, date) && weekTypeOn(st, date) !== 'floor') {
    out.push({ kind: 'maintenanceBreak', message: program.nutritionPrompts.maintenanceBreaks.banner });
  }
  return out;
}

export function dayPlan(input: EngineInput, st: EngineState, date: LocalDate): DayPlan {
  const program = st.program;
  const wd = weekdayIndex(date);
  const weekType = weekTypeOn(st, date);
  const pw = programWeek(date, program.athlete.startDate);
  const loggedLifting = st.sessions.filter((r) => r.date === date).map((r) => r.event);
  const loggedConditioning = st.condSessions.filter((c) => c.date === date && !c.event.extra).map((c) => c.event);
  const extraConditioning = st.condSessions.filter((c) => c.date === date && c.event.extra).map((c) => c.event);
  const notes: string[] = [];
  if (program.safety.sorenessNoteProgramWeeks.includes(pw)) notes.push(program.safety.sorenessNote);
  if (weekType === 'floor' && insideBreak(program, date)) notes.push(program.deload.floorWeek.insideMaintenanceBreakNote);

  const base: DayPlan = {
    date,
    weekday: wd,
    weekType,
    programWeek: pw,
    kind: 'off',
    status: 'off',
    swapTo: null,
    skipId: null,
    needsConsecutiveConfirm: false,
    workout: null,
    summary: [],
    conditioning: null,
    loggedLifting,
    loggedConditioning,
    extraConditioning,
    message: null,
    projected: false,
    notes,
    foodLines: [],
    calendarNote: program.calendarNotes.find((n) => n.date === date)?.label ?? null,
    banners: bannersFor(st, date),
  };

  const food = (lifting: boolean): string[] => {
    const n = program.nutritionPrompts;
    const lines: string[] = [];
    if (lifting) {
      lines.push(n.liftingDay);
      if (st.foodLever.on) lines.push(n.foodLeverOnLiftingDay);
    }
    const cond = loggedConditioning.find((c) => !c.stopped);
    if (cond) {
      const extra = n.conditioningDayExtra.find((x) => x.phases.includes(cond.phase));
      if (extra) lines.push(extra.prompt);
    }
    return lines;
  };

  if (loggedLifting.length > 0 || loggedConditioning.length > 0) {
    const lifting = loggedLifting.length > 0;
    return {
      ...base,
      kind: lifting ? 'lifting' : 'conditioning',
      status: 'done',
      workout: loggedLifting[0]?.workout ?? null,
      summary: loggedLifting.flatMap((e) =>
        e.lifts
          .filter((l) => l.sets.length > 0)
          .map((l) => `${program.lifts[l.lift].label} ${l.sets.length}×${l.sets[0]?.reps ?? 0} · ${formatLb(l.sets[0]?.weight ?? 0)}`),
      ),
      foodLines: food(lifting),
    };
  }

  // "No time today" (section 1): the skipped day, then the day of the default week whose session lands here.
  const skip = skipOn(st, date);
  if (skip) return { ...base, kind: skip.kind, status: 'skipped', skipId: skip.id, message: 'Skipped: no time.' };
  const source = slotSource(st, date);
  if (source === null) return { ...base, message: 'Off.' };
  if (sickOn(st, date)) return { ...base, kind: 'sick', message: program.illness.sickModeMessage };

  const ws = weekStart(date);
  const floor = weekType === 'floor';
  const liftCount = st.sessions.filter((r) => weekStart(r.date) === ws).length;
  const condCount = st.condSessions.filter((c) => c.counted && weekStart(c.date) === ws).length;
  const liftCap = floor ? program.deload.floorWeek.maxLiftingSessions : program.schedule.maxLiftingSessionsPerWeek;
  const condCap = floor ? 0 : program.schedule.maxConditioningSessionsPerWeek;
  const yesterdayLift = st.sessions.some((r) => r.date === addDays(date, -1));
  const liftOk = liftCount < liftCap && !(floor && yesterdayLift);
  const condOk = condCount < condCap;
  const defaultLifting = (program.schedule.liftDays as string[]).includes(weekdayName(source));

  let kind: DayPlan['kind'];
  let swapTo: DayPlan['swapTo'];
  if (defaultLifting) {
    kind = liftOk ? 'lifting' : 'off';
    swapTo = condOk ? 'conditioning' : null;
  } else {
    kind = condOk ? 'conditioning' : 'off';
    swapTo = liftOk ? 'lifting' : null;
  }
  const status = kind === 'off' ? 'off' : date < input.today ? 'missed' : 'planned';
  const plan: DayPlan = { ...base, kind, status, swapTo, message: kind === 'off' ? 'Off.' : null };

  if (kind === 'lifting') {
    const session = buildSessionPlan(st, date);
    plan.workout = session.workout;
    plan.needsConsecutiveConfirm = yesterdayLift && !floor;
    plan.summary = [
      ...session.lifts.map((l) =>
        l.kind === 'calibration'
          ? `${l.label}: find the work weight`
          : `${l.label} ${l.sets}×${l.reps} · ${formatLb(l.weight)}${kindNote(program, l.kind)}`,
      ),
      ...session.paused.map((p) => `${p.label}: paused`),
      ...session.waiting.map((w) => `${w.label}: calibrates in a normal week`),
    ];
    plan.foodLines = food(true);
  } else if (kind === 'conditioning') {
    plan.conditioning = conditioningPlan(st, date);
    plan.foodLines = food(false);
  }
  return plan;
}

/** Lines for sessions that aren't the usual heavy work, so the day says so (L6). */
function kindNote(program: EngineState['program'], kind: PrescriptionKind): string {
  switch (kind) {
    case 'lightDay':
      return ' · light day';
    case 'painReturn':
      return ` · return at ${Math.round(program.safety.painReturnFraction * 100)}%`;
    case 'graduated':
      return ' · graduated';
    default:
      return '';
  }
}

export function planForDate(input: EngineInput, date: LocalDate): DayPlan {
  return dayPlan(input, replay(input, date), date);
}

export function summarizeWeek(input: EngineInput, monday: LocalDate): WeekSummary {
  const program = input.program;
  const dates = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const days: DayPlan[] = [];
  // One pass through the log for the whole week, not one replay per day.
  const st = replayEach(input, dates, (state, date) => days.push(dayPlan(input, state, date)));
  const liftCap =
    weekKind(st, monday) === 'floor' ? program.deload.floorWeek.maxLiftingSessions : program.schedule.maxLiftingSessionsPerWeek;
  projectCaps(days, input.today, liftCap);
  projectAlternation(days, input.today);
  const inWeek = (d: LocalDate) => weekStart(d) === monday;
  const condMinutes = st.condSessions
    .filter((c) => inWeek(c.date) && (c.counted || c.event.extra || READINGS.SHORT_SESSIONS_COUNT_TOWARD_WEEKLY_BAR))
    .reduce((sum, c) => sum + c.minutes, 0);
  const spin = st.sessions.filter((r) => inWeek(r.date)).reduce((sum, r) => sum + r.spinMinutes, 0);
  return {
    weekStart: monday,
    weekType: weekKind(st, monday),
    days,
    liftingDone: st.sessions.filter((r) => inWeek(r.date)).length,
    conditioningDone: st.condSessions.filter((c) => c.counted && inWeek(c.date)).length,
    conditioningMinutes: condMinutes + spin,
    conditioningTargetMinutes: program.conditioning.weeklyTargetMinutes,
    calendarNotes: program.calendarNotes.filter((n) => inWeek(n.date)),
  };
}

/**
 * Each day's plan counts only the sessions already logged, so later planned
 * lifting days can run past the week's cap: a floor week allows two, on the
 * first two lift days (section 10). Planned days beyond the cap show as off.
 */
function projectCaps(days: DayPlan[], today: LocalDate, liftCap: number): void {
  let left = liftCap - days.reduce((n, d) => n + d.loggedLifting.length, 0);
  for (const d of days) {
    if (d.kind !== 'lifting' || d.status === 'done' || d.status === 'skipped' || d.date < today) continue;
    if (left > 0) {
      left -= 1;
      continue;
    }
    Object.assign(d, { kind: 'off', status: 'off', workout: null, summary: [], foodLines: [], message: 'Off.', projected: true });
  }
}

/**
 * Only the next lifting session's prescription is known: the ones after it
 * depend on how it goes. Later planned lifting days take turns A and B
 * (section 1) and show no weights yet.
 */
function projectAlternation(days: DayPlan[], today: LocalDate): void {
  let next: Workout | null = null;
  for (const d of days) {
    if (d.kind !== 'lifting' || d.status === 'done' || d.status === 'skipped' || d.date < today || !d.workout) continue;
    if (next === null) {
      next = d.workout;
      continue;
    }
    next = next === 'A' ? 'B' : 'A';
    d.workout = next;
    d.summary = [];
    d.projected = true;
  }
}

export function findNextLiftingDate(input: EngineInput, from: LocalDate): LocalDate | null {
  const dates = Array.from({ length: 21 }, (_, i) => addDays(from, i));
  let found: LocalDate | null = null;
  replayEach(input, dates, (st, date) => {
    if (found !== null) return;
    const p = dayPlan(input, st, date);
    if (p.kind === 'lifting' && p.status !== 'done' && p.status !== 'skipped') found = date;
  });
  return found;
}
