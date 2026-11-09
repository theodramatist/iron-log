// The repository: the event log in memory, written through to storage. State
// is never stored; the engine replays this log on every change (SPEC.md section 2).

import { sortEvents, type AnyEvent, type EngineInput, type IsoTimestamp, type LocalDate, type Program, type Settings } from '../engine';
import { buildBackup } from './backup';
import { EMPTY_META, type BackupFile, type DraftKind, type DraftRecord, type Meta, type StorageAdapter, type RemoteBackup } from './types';

export interface Clock {
  nowIso(): IsoTimestamp;
}

export const systemClock: Clock = { nowIso: () => new Date().toISOString() };

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** An event before the repository stamps its ID and timestamps. */
export type NewEvent = DistributiveOmit<AnyEvent, 'id' | 'createdAt' | 'updatedAt'>;

export interface Repository {
  readonly durable: boolean;
  load(): Promise<void>;
  /** Every event, in replay order. */
  events(): readonly AnyEvent[];
  settings(): Partial<Settings>;
  meta(): Meta;
  /** Goes up by one on every change. */
  version(): number;
  input(today: LocalDate): EngineInput;
  add(ev: NewEvent): Promise<AnyEvent>;
  /** Add events that already have IDs and timestamps, such as the setup events. */
  addEvents(evs: AnyEvent[]): Promise<void>;
  /** Edit a logged event. Its ID, type, and createdAt stay put, so replay order holds. */
  update<E extends AnyEvent>(id: string, edit: (draft: E) => void): Promise<E>;
  remove(id: string): Promise<void>;
  setSettings(settings: Partial<Settings>): Promise<void>;
  backup(): BackupFile;
  markExported(): Promise<void>;
  /** Turn the automatic GitHub backup on or off, or record how its last try went. */
  setRemote(remote: RemoteBackup | null): Promise<void>;
  /** Replace everything with an imported backup. The UI confirms first. */
  restore(file: BackupFile): Promise<void>;
  clearAll(): Promise<void>;
  getDraft<T>(kind: DraftKind): Promise<DraftRecord<T> | null>;
  saveDraft<T>(kind: DraftKind, data: T): Promise<void>;
  clearDraft(kind: DraftKind): Promise<void>;
  subscribe(listener: () => void): () => void;
}

export function createRepository(
  adapter: StorageAdapter,
  program: Program,
  opts: { clock?: Clock; makeId?: () => string } = {},
): Repository {
  const clock = opts.clock ?? systemClock;
  const makeId = opts.makeId ?? (() => crypto.randomUUID());
  let events: AnyEvent[] = [];
  let settings: Partial<Settings> = {};
  let meta: Meta = { ...EMPTY_META };
  let version = 0;
  const listeners = new Set<() => void>();

  const changed = () => {
    version += 1;
    for (const fn of [...listeners]) fn();
  };
  const setEvents = (next: AnyEvent[]) => {
    events = sortEvents(next);
  };

  return {
    durable: adapter.durable,

    async load() {
      const data = await adapter.load();
      setEvents(data.events);
      settings = data.settings;
      meta = data.meta;
      changed();
    },

    events: () => events,
    settings: () => settings,
    meta: () => meta,
    version: () => version,

    input(today) {
      return { program, settings, events: [...events], today };
    },

    async add(ev) {
      const now = clock.nowIso();
      const full = { ...ev, id: makeId(), createdAt: now, updatedAt: now } as AnyEvent;
      await adapter.putEvent(full);
      setEvents([...events, full]);
      changed();
      return full;
    },

    async addEvents(evs) {
      await adapter.putEvents(evs);
      const ids = new Set(evs.map((e) => e.id));
      setEvents([...events.filter((e) => !ids.has(e.id)), ...evs]);
      changed();
    },

    async update<E extends AnyEvent>(id: string, edit: (draft: E) => void): Promise<E> {
      const current = events.find((e) => e.id === id);
      if (!current) throw new Error(`No event with ID ${id}`);
      const draft = structuredClone(current) as E;
      edit(draft);
      const next = { ...draft, id: current.id, type: current.type, createdAt: current.createdAt, updatedAt: clock.nowIso() } as E;
      await adapter.putEvent(next);
      setEvents(events.map((e) => (e.id === id ? next : e)));
      changed();
      return next;
    },

    async remove(id) {
      await adapter.deleteEvent(id);
      setEvents(events.filter((e) => e.id !== id));
      changed();
    },

    async setSettings(s) {
      await adapter.putSettings(s);
      settings = structuredClone(s);
      changed();
    },

    backup() {
      return buildBackup(events, settings, program, clock.nowIso());
    },

    async markExported() {
      meta = { ...meta, lastExportAt: clock.nowIso() };
      await adapter.putMeta(meta);
      changed();
    },

    async setRemote(remote) {
      meta = { ...meta, remote };
      await adapter.putMeta(meta);
      changed();
    },

    async restore(file) {
      await adapter.replaceAll({ events: file.events, settings: file.settings });
      setEvents(structuredClone(file.events));
      settings = structuredClone(file.settings);
      changed();
    },

    async clearAll() {
      await adapter.clearAll();
      events = [];
      settings = {};
      meta = { ...EMPTY_META };
      changed();
    },

    async getDraft<T>(kind: DraftKind) {
      return (await adapter.getDraft(kind)) as DraftRecord<T> | null;
    },

    async saveDraft<T>(kind: DraftKind, data: T) {
      await adapter.putDraft({ kind, savedAt: clock.nowIso(), data });
    },

    async clearDraft(kind) {
      await adapter.deleteDraft(kind);
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
