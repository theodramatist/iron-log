// SPEC.md sections 2, 4, and 8: the event store, drafts, backups, and storage persistence.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  backupFileName,
  createRepository,
  memoryAdapter,
  parseBackup,
  persistentStorageStatus,
  requestPersistentStorage,
  serializeBackup,
  type Repository,
} from '../src/data';
import { liftStates, planFor, prescribe, triggers, type AnyEvent, type LiftingSessionEvent } from '../src/engine';
import { PROGRAM, buildLog, calibrate, cd, made } from './helpers/log';

function fakeClock(start = '2026-11-10T18:00:00.000Z') {
  let t = Date.parse(start);
  return { nowIso: () => new Date((t += 1000)).toISOString() };
}

function idMaker() {
  let n = 0;
  return () => `id-${++n}`;
}

function sampleLog() {
  return buildLog({ setup: { squat: 'rir3to4', press: 'rir1to2', deadlift: 'light', chinSpare: 2 } })
    .lift(
      '2026-11-04',
      {
        squat: made('rir3to4'),
        bench: calibrate([
          [45, 'fast'],
          [65, 'fast'],
          [85, 'slowing'],
          [95, 'slowed'],
        ]),
        deadlift: made('rir1to2'),
        chin: cd.made(1),
        dip: cd.calibrate(120, 2),
      },
      { checkIns: { mostNightsUnder7: true } },
    )
    .cond('2026-11-05', { minutes: 22 })
    .lift('2026-11-06', { squat: made('rir1to2'), press: made('rir1to2'), deadlift: made('rir1to2'), chin: cd.made(2) })
    .bodyweight('2026-11-07', 268)
    .declare('2026-11-09', 'light')
    .skip('2026-11-10', 'conditioning');
}

async function repoWith(events: AnyEvent[], adapter = memoryAdapter()) {
  const repo = createRepository(adapter, PROGRAM, { clock: fakeClock(), makeId: idMaker() });
  await repo.load();
  await repo.addEvents(events);
  return { repo, adapter };
}

const TODAY = '2026-11-10';

function snapshot(repo: Repository) {
  const input = repo.input(TODAY);
  return {
    events: repo.events(),
    states: liftStates(input),
    plan: planFor(input, TODAY),
    session: prescribe(input, TODAY),
    suggestions: triggers(input),
  };
}

describe('Data: the event store, drafts, and backups', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('T81 Export and import', async () => {
    const { repo, adapter } = await repoWith(sampleLog().events);
    const before = snapshot(repo);
    expect(before.events.length).toBeGreaterThan(5);

    const text = serializeBackup(repo.backup());
    await repo.clearAll();
    expect(repo.events()).toHaveLength(0);

    const parsed = parseBackup(text);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.eventCount).toBe(before.events.length);
    expect(parsed.exportedAt).toBe(parsed.file.exportedAt);
    await repo.restore(parsed.file);
    expect(snapshot(repo)).toEqual(before);

    // A fresh launch reads back exactly what was restored.
    const reopened = createRepository(adapter, PROGRAM);
    await reopened.load();
    expect(snapshot(reopened)).toEqual(before);
  });

  it('builds backups in the SPEC.md section 4 format', async () => {
    const { repo } = await repoWith(sampleLog().events);
    const file = repo.backup();
    expect(Object.keys(file)).toEqual(['app', 'schemaVersion', 'programVersion', 'exportedAt', 'settings', 'events']);
    expect(file).toMatchObject({ app: 'iron-log', schemaVersion: 1, programVersion: '2026-11-02', settings: {} });
    expect(file.exportedAt).toMatch(/^2026-11-10T18:00:\d\d\.000Z$/);
    const dates = file.events.map((e) => e.date);
    expect(dates).toEqual([...dates].sort());
  });

  it('names backup files so .gitignore keeps them out of the repo', () => {
    expect(backupFileName('2026-11-06')).toBe('iron-log-backup-2026-11-06.json');
  });

  it('refuses files that aren’t Iron Log backups', async () => {
    const { repo } = await repoWith(sampleLog().events);
    const good = repo.backup();
    const bad = (mutate: (f: Record<string, unknown>) => void) => {
      const f = structuredClone(good) as unknown as Record<string, unknown>;
      mutate(f);
      return parseBackup(JSON.stringify(f));
    };
    expect(parseBackup('not json')).toMatchObject({ ok: false, error: "This file isn't valid JSON." });
    expect(parseBackup('[]')).toMatchObject({ ok: false, error: "This file isn't an Iron Log backup." });
    expect(bad((f) => (f.app = 'retraining-tracker'))).toMatchObject({ ok: false, error: "This file isn't an Iron Log backup." });
    expect(bad((f) => (f.schemaVersion = 2))).toMatchObject({ ok: false, error: 'This backup is from a newer version of Iron Log.' });
    expect(bad((f) => (f.schemaVersion = 0))).toMatchObject({ ok: false, error: "This backup's version isn't supported." });
    expect(bad((f) => delete f.events)).toMatchObject({ ok: false, error: 'This backup has no event list.' });
    expect(bad((f) => ((f.events as AnyEvent[])[1]!.date = '2026-13-40'))).toMatchObject({ ok: false });
    expect(bad((f) => (((f.events as AnyEvent[])[1] as { type: string }).type = 'mystery'))).toMatchObject({ ok: false });
    expect(bad((f) => ((f.events as AnyEvent[])[2]!.id = (f.events as AnyEvent[])[1]!.id))).toMatchObject({
      ok: false,
      error: 'Two entries in this backup share an ID.',
    });
    const lifting = (f: Record<string, unknown>) =>
      (f.events as AnyEvent[]).find((e): e is LiftingSessionEvent => e.type === 'liftingSession')!;
    expect(bad((f) => ((lifting(f) as unknown as { lifts: unknown }).lifts = 'squat'))).toMatchObject({ ok: false });
    const skip = (f: Record<string, unknown>) => (f.events as AnyEvent[]).find((e) => e.type === 'skip') as unknown as Record<string, unknown>;
    expect(bad((f) => (skip(f).reason = 'tired'))).toMatchObject({ ok: false });
    expect(bad((f) => (skip(f).kind = 'rest'))).toMatchObject({ ok: false });
    expect(bad((f) => (lifting(f).lifts[0]!.sets = [{ weight: '95', reps: 5 }] as never))).toMatchObject({ ok: false });
    expect(bad((f) => (f.events = (f.events as AnyEvent[]).filter((e) => e.type !== 'setup')))).toMatchObject({
      ok: false,
      error: "This backup has no setup entry, so it can't be restored.",
    });
    expect(parseBackup(JSON.stringify(good))).toMatchObject({ ok: true, eventCount: good.events.length });
  });

  it('drops session drafts when a backup replaces the log', async () => {
    const { repo } = await repoWith(sampleLog().events);
    const file = repo.backup();
    await repo.saveDraft('lifting', { step: 'lifting' });
    await repo.saveDraft('conditioning', { step: 'running' });
    await repo.restore(file);
    expect(await repo.getDraft('lifting')).toBeNull();
    expect(await repo.getDraft('conditioning')).toBeNull();
  });

  it('adds, edits, and removes events, and every change replays', async () => {
    const { repo } = await repoWith(sampleLog().events);
    const seen: number[] = [];
    const unsubscribe = repo.subscribe(() => seen.push(repo.version()));

    // Sunday 11-08 is the last day before the light week declared for 11-09.
    const squatNext = () => prescribe(repo.input('2026-11-08'), '2026-11-08').lifts.find((l) => l.lift === 'squat')?.weight;
    expect(squatNext()).toBe(120); // 115 made with 1-2 left: +5

    const weighIn = await repo.add({ type: 'bodyweight', date: '2026-11-08', pounds: 266 });
    expect(weighIn).toMatchObject({ id: 'id-1', type: 'bodyweight', pounds: 266 });
    expect(weighIn.createdAt).toBe(weighIn.updatedAt);

    const friday = repo.events().find((e): e is LiftingSessionEvent => e.type === 'liftingSession' && e.date === '2026-11-06')!;
    const edited = await repo.update<LiftingSessionEvent>(friday.id, (e) => {
      const squat = e.lifts.find((l) => l.lift === 'squat');
      if (squat) squat.effort = 'rir3to4';
    });
    expect(edited.createdAt).toBe(friday.createdAt);
    expect(edited.updatedAt > friday.updatedAt).toBe(true);
    expect(squatNext()).toBe(125); // 115 made with 3-4 left: +10

    await repo.remove(weighIn.id);
    expect(repo.events().some((e) => e.id === weighIn.id)).toBe(false);
    expect(seen).toEqual([seen[0], seen[0]! + 1, seen[0]! + 2]);

    unsubscribe();
    await repo.add({ type: 'bodyweight', date: '2026-11-08', pounds: 265 });
    expect(seen).toHaveLength(3);
  });

  it('keeps drafts out of the log and out of backups', async () => {
    const { repo } = await repoWith(sampleLog().events);
    const count = repo.events().length;
    await repo.saveDraft('lifting', { date: TODAY, sets: [[95, 5]] });
    expect(await repo.getDraft('lifting')).toMatchObject({ kind: 'lifting', data: { date: TODAY, sets: [[95, 5]] } });
    expect(repo.events()).toHaveLength(count);
    expect(JSON.stringify(repo.backup())).not.toContain('"sets":[[95,5]]');
    await repo.clearDraft('lifting');
    expect(await repo.getDraft('lifting')).toBeNull();

    await repo.saveDraft('conditioning', { minutes: 12 });
    await repo.clearAll();
    expect(await repo.getDraft('conditioning')).toBeNull();
  });

  it('remembers the last export for the backup reminder', async () => {
    const { repo } = await repoWith(sampleLog().events);
    expect(repo.meta().lastExportAt).toBeNull();
    await repo.markExported();
    expect(repo.meta().lastExportAt).toMatch(/^2026-11-10T18:00:/);
    await repo.clearAll();
    expect(repo.meta().lastExportAt).toBeNull();
  });

  it('requests persistent storage where the browser offers it', async () => {
    vi.stubGlobal('navigator', {});
    expect(await requestPersistentStorage()).toBe('unsupported');
    expect(await persistentStorageStatus()).toBe('unsupported');
    vi.stubGlobal('navigator', { storage: { persist: async () => true, persisted: async () => true } });
    expect(await requestPersistentStorage()).toBe('granted');
    expect(await persistentStorageStatus()).toBe('granted');
    vi.stubGlobal('navigator', { storage: { persist: async () => false, persisted: async () => false } });
    expect(await requestPersistentStorage()).toBe('denied');
  });
});

describe('The backup reminder (SPEC.md section 8)', () => {
  const friday = (date: string): AnyEvent =>
    ({ id: date, type: 'conditioningSession', date, createdAt: '', updatedAt: '', stopped: false }) as unknown as AnyEvent;

  it('shows after Friday\'s session when there has been no export in 7 days', async () => {
    const { backupReminderDue } = await import('../src/ui/backups');
    const events = [friday('2026-11-06')];
    expect(backupReminderDue(events, '2026-11-05', null)).toBe(false); // Thursday: Friday hasn't come
    expect(backupReminderDue(events, '2026-11-06', null)).toBe(true); // never exported
    expect(backupReminderDue(events, '2026-11-06', '2026-10-30')).toBe(true); // 7 days ago
    expect(backupReminderDue(events, '2026-11-06', '2026-11-02')).toBe(false); // 4 days ago
    expect(backupReminderDue(events, '2026-11-08', null)).toBe(true); // still up on Sunday
    expect(backupReminderDue(events, '2026-11-13', null)).toBe(false); // that Friday is a week old
    expect(backupReminderDue([friday('2026-11-05')], '2026-11-06', null)).toBe(false); // a Thursday session
  });
});
