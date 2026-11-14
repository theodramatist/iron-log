// Adding to a logged session what was done but never logged (RULES.md
// sections 0 and 17, T109): a lift that shows "Not reached," or chins or dips
// with nothing logged. Each goes in at that day's prescription, for him to
// correct to what he did, and the log replays from there.

import {
  prescribe,
  type AssistMovementLog,
  type AssistMovementPlan,
  type BarbellLiftId,
  type EngineInput,
  type LiftLog,
  type LiftingSessionEvent,
} from '../../engine';

/**
 * Lifts in the session he never reached. A calibration can't be added
 * afterward: it runs at the lift's next session instead.
 */
export function addableLifts(ev: LiftingSessionEvent): LiftLog[] {
  return ev.lifts.filter((l) => l.notReached === true && l.sets.length === 0 && l.prescription.kind !== 'calibration' && l.prescription.sets > 0);
}

/** The lift done at its prescription, every set made, with the effort question still to answer. */
export function addedLift(log: LiftLog): LiftLog {
  const { weight, sets, reps } = log.prescription;
  const added: LiftLog = { ...log, sets: Array.from({ length: sets }, () => ({ weight, reps })) };
  delete added.notReached;
  delete added.effort;
  return added;
}

/** The chins and dips the session screen showed that day: the log replayed up to the session, without it. */
function dayAssist(input: EngineInput, ev: LiftingSessionEvent) {
  const painAnswers: Partial<Record<BarbellLiftId, 'gone' | 'stillThere'>> = {};
  for (const l of ev.lifts) if (l.painAnswer) painAnswers[l.lift] = l.painAnswer;
  const others: EngineInput = { ...input, events: input.events.filter((e) => e.id !== ev.id) };
  return prescribe(others, ev.date, { checkIns: ev.checkIns, painAnswers, ...(ev.equipmentDown ? { equipmentDown: ev.equipmentDown } : {}) }).assist;
}

/**
 * Chins or dips prescribed that day with nothing logged. Not when they were
 * swapped for other exercises, and not a calibration, which waits for the
 * next session like a lift's.
 */
export function addableAssist(input: EngineInput, ev: LiftingSessionEvent): AssistMovementPlan[] {
  if (ev.weekType === 'floor' || (ev.substitutions?.length ?? 0) > 0 || ev.equipmentDown?.includes('assistMachine')) return [];
  if (ev.assist?.chin && ev.assist.dip) return [];
  const a = dayAssist(input, ev);
  if (!a || a.substitutions) return [];
  return [a.chin, a.dip].filter((m): m is AssistMovementPlan => m !== null && !ev.assist?.[m.lift] && m.calibration === null);
}

/** Chins or dips done at the day's prescription, every rep made, with reps to spare still to answer. */
export function addedAssist(m: AssistMovementPlan): AssistMovementLog {
  return { kind: m.kind, assistance: m.assistance, addedLoad: m.addedLoad, targetReps: [...m.targetReps], reps: [...m.targetReps] };
}
