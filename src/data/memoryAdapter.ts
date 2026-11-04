// In-memory storage for tests, and the fallback when IndexedDB isn't available.
// Values are cloned in and out, as IndexedDB's structured clone does.

import type { AnyEvent, Settings } from '../engine';
import { EMPTY_META, type DraftKind, type DraftRecord, type Meta, type StorageAdapter } from './types';

export function memoryAdapter(): StorageAdapter {
  const events = new Map<string, AnyEvent>();
  const drafts = new Map<DraftKind, DraftRecord>();
  let settings: Partial<Settings> = {};
  let meta: Meta = { ...EMPTY_META };
  const clone = <T>(x: T): T => structuredClone(x);

  return {
    durable: false,
    async load() {
      return { events: [...events.values()].map(clone), settings: clone(settings), meta: clone(meta) };
    },
    async putEvent(ev) {
      events.set(ev.id, clone(ev));
    },
    async putEvents(evs) {
      for (const ev of evs) events.set(ev.id, clone(ev));
    },
    async deleteEvent(id) {
      events.delete(id);
    },
    async replaceAll(data) {
      events.clear();
      drafts.clear();
      for (const ev of data.events) events.set(ev.id, clone(ev));
      settings = clone(data.settings);
    },
    async putSettings(s) {
      settings = clone(s);
    },
    async putMeta(m) {
      meta = clone(m);
    },
    async clearAll() {
      events.clear();
      drafts.clear();
      settings = {};
      meta = { ...EMPTY_META };
    },
    async getDraft(kind) {
      const d = drafts.get(kind);
      return d ? clone(d) : null;
    },
    async putDraft(d) {
      drafts.set(d.kind, clone(d));
    },
    async deleteDraft(kind) {
      drafts.delete(kind);
    },
  };
}
