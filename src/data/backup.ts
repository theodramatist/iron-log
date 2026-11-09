// Export and import (SPEC.md sections 4 and 8). Import checks the shape and
// the schema version before anything is replaced.

import { isValidDate, sortEvents, type AnyEvent, type EventType, type IsoTimestamp, type LocalDate, type Program, type Settings } from '../engine';
import { APP_ID, BACKUP_SCHEMA_VERSION, type BackupFile } from './types';

export const EVENT_TYPES = [
  'setup',
  'liftingSession',
  'conditioningSession',
  'bodyweight',
  'settingsChange',
  'weekDeclaration',
  'floorWeekRemoved',
  'floorWeekAdded',
  'screeningAcknowledged',
  'foodLeverAnswer',
  'illness',
  'painCleared',
  'suggestionDismissed',
  'override',
  'skip',
] as const satisfies readonly EventType[];

// Fails to compile if an event type is added to the engine without being listed here.
const everyTypeListed: Exclude<EventType, (typeof EVENT_TYPES)[number]> extends never ? true : never = true;
void everyTypeListed;

export function buildBackup(
  events: readonly AnyEvent[],
  settings: Partial<Settings>,
  program: Program,
  exportedAt: IsoTimestamp,
): BackupFile {
  return {
    app: APP_ID,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    programVersion: program.meta.programVersion.slice(0, 10),
    exportedAt,
    settings: structuredClone(settings),
    events: structuredClone(sortEvents([...events])),
  };
}

export function serializeBackup(file: BackupFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}

/** The .gitignore pattern `iron-log-backup-*.json` keeps these out of the repo. */
export function backupFileName(localDate: LocalDate): string {
  return `iron-log-backup-${localDate}.json`;
}

export type ParseResult =
  | { ok: true; file: BackupFile; eventCount: number; exportedAt: IsoTimestamp }
  | { ok: false; error: string };

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isStr = (x: unknown): x is string => typeof x === 'string';
const optional = (x: unknown, check: (v: unknown) => boolean) => x === undefined || check(x);
const isNumArray = (x: unknown) => Array.isArray(x) && x.every(isNum);
const BARBELL = ['squat', 'press', 'bench', 'deadlift', 'powerClean', 'row'];
const LIFTS = [...BARBELL, 'chin', 'dip'];

function liftLogOk(l: unknown): boolean {
  if (!isObj(l) || !BARBELL.includes(l.lift as string)) return false;
  const p = l.prescription;
  if (!isObj(p) || !isStr(p.kind) || !isNum(p.weight) || !isNum(p.sets) || !isNum(p.reps)) return false;
  if (!Array.isArray(l.sets) || !l.sets.every((s) => isObj(s) && isNum(s.weight) && isNum(s.reps))) return false;
  if (!optional(l.calibration, (c) => isObj(c) && Array.isArray(c.sets))) return false;
  return true;
}

function assistLogOk(a: unknown): boolean {
  return (
    isObj(a) &&
    (a.kind === 'heavy' || a.kind === 'lightWeek') &&
    isNum(a.assistance) &&
    isNum(a.addedLoad) &&
    isNumArray(a.reps) &&
    isNumArray(a.targetReps) &&
    optional(a.calibration, (c) => isObj(c) && isNum(c.setting))
  );
}

/** Type-specific checks: enough that the engine can replay the event safely. */
function payloadOk(e: Obj): boolean {
  switch (e.type as EventType) {
    case 'setup':
      return isObj(e.mondayEffort) && isNum(e.chinSpare) && isNum(e.barLb) && Array.isArray(e.plates);
    case 'liftingSession':
      return (
        (e.workout === 'A' || e.workout === 'B') &&
        isStr(e.weekType) &&
        isObj(e.checkIns) &&
        Array.isArray(e.lifts) &&
        e.lifts.every(liftLogOk) &&
        optional(e.assist, (a) => isObj(a) && optional(a.chin, assistLogOk) && optional(a.dip, assistLogOk)) &&
        optional(e.spinMinutes, isNum)
      );
    case 'conditioningSession':
      return (
        isNum(e.actualMinutes) &&
        isNum(e.intervalsDone) &&
        isNum(e.phase) &&
        isNum(e.conditioningWeek) &&
        (e.extra === undefined || typeof e.extra === 'boolean')
      );
    case 'bodyweight':
      return isNum(e.pounds);
    case 'settingsChange':
      return isStr(e.key);
    case 'weekDeclaration':
      return ['light', 'floor', 'illness', 'overload'].includes(e.kind as string) && isStr(e.scope);
    case 'floorWeekRemoved':
    case 'floorWeekAdded':
      return isStr(e.weekStart) && isValidDate(e.weekStart);
    case 'screeningAcknowledged':
      return true;
    case 'foodLeverAnswer':
      return BARBELL.includes(e.lift as string) && typeof e.answer === 'boolean';
    case 'illness':
      return e.kind === 'start' || e.kind === 'better';
    case 'painCleared':
      return BARBELL.includes(e.lift as string) && (e.how === 'gone' || e.how === 'clinician');
    case 'suggestionDismissed':
      return isStr(e.suggestion);
    case 'override':
      return LIFTS.includes(e.lift as string) && isStr(e.field) && isNum(e.value);
    case 'skip':
      return (e.kind === 'lifting' || e.kind === 'conditioning') && e.reason === 'time';
  }
}

function eventProblem(e: unknown, n: number): string | null {
  const where = `Entry ${n} in this backup`;
  if (!isObj(e)) return `${where} isn't an event.`;
  if (!isStr(e.id) || e.id === '') return `${where} has no ID.`;
  if (!(EVENT_TYPES as readonly string[]).includes(e.type as string)) return `${where} has an unknown type.`;
  if (!isStr(e.date) || !isValidDate(e.date)) return `${where} has a bad date.`;
  if (!isStr(e.createdAt) || !isStr(e.updatedAt)) return `${where} is missing its timestamps.`;
  if (!payloadOk(e)) return `${where} is damaged (a ${e.type} entry with missing fields).`;
  return null;
}

export function parseBackup(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "This file isn't valid JSON." };
  }
  if (!isObj(raw) || raw.app !== APP_ID) return { ok: false, error: "This file isn't an Iron Log backup." };
  if (raw.schemaVersion !== BACKUP_SCHEMA_VERSION) {
    return isNum(raw.schemaVersion) && raw.schemaVersion > BACKUP_SCHEMA_VERSION
      ? { ok: false, error: 'This backup is from a newer version of Iron Log.' }
      : { ok: false, error: "This backup's version isn't supported." };
  }
  if (!Array.isArray(raw.events)) return { ok: false, error: 'This backup has no event list.' };
  if (!isStr(raw.exportedAt)) return { ok: false, error: 'This backup has no export date.' };
  if (!optional(raw.settings, isObj)) return { ok: false, error: 'This backup has damaged settings.' };

  const ids = new Set<string>();
  for (const [i, e] of raw.events.entries()) {
    const problem = eventProblem(e, i + 1);
    if (problem) return { ok: false, error: problem };
    const id = (e as Obj).id as string;
    if (ids.has(id)) return { ok: false, error: 'Two entries in this backup share an ID.' };
    ids.add(id);
  }
  // Without its setup entry, the app would start setup again on top of the log.
  if (!raw.events.some((e) => (e as Obj).type === 'setup')) {
    return { ok: false, error: "This backup has no setup entry, so it can't be restored." };
  }

  const file: BackupFile = {
    app: APP_ID,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    programVersion: isStr(raw.programVersion) ? raw.programVersion : '',
    exportedAt: raw.exportedAt,
    settings: (raw.settings as Partial<Settings> | undefined) ?? {},
    events: raw.events as AnyEvent[],
  };
  return { ok: true, file, eventCount: file.events.length, exportedAt: file.exportedAt };
}
