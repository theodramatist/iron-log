// IndexedDB storage via idb. Every app on theodramatist.github.io shares one
// origin, so the database has its own name: "iron-log".

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { AnyEvent, Settings } from '../engine';
import { EMPTY_META, type DraftKind, type DraftRecord, type Meta, type StorageAdapter } from './types';

export const DB_NAME = 'iron-log';
export const DB_VERSION = 1;

interface IronLogDB extends DBSchema {
  events: { key: string; value: AnyEvent; indexes: { byDate: string } };
  drafts: { key: DraftKind; value: DraftRecord };
  meta: { key: 'settings' | 'meta'; value: Partial<Settings> | Meta };
}

export async function idbAdapter(name: string = DB_NAME): Promise<StorageAdapter> {
  let db: IDBPDatabase<IronLogDB> | null = null;
  db = await openDB<IronLogDB>(name, DB_VERSION, {
    upgrade(upgradeDb) {
      const events = upgradeDb.createObjectStore('events', { keyPath: 'id' });
      events.createIndex('byDate', 'date');
      upgradeDb.createObjectStore('drafts', { keyPath: 'kind' });
      upgradeDb.createObjectStore('meta');
    },
    // A newer version is opening (an updated app in another tab): step aside.
    blocking() {
      db?.close();
    },
  });
  const conn = db;

  return {
    durable: true,
    async load() {
      const tx = conn.transaction(['events', 'meta'], 'readonly');
      const [events, settings, meta] = await Promise.all([
        tx.objectStore('events').getAll(),
        tx.objectStore('meta').get('settings'),
        tx.objectStore('meta').get('meta'),
        tx.done,
      ]);
      return {
        events,
        settings: (settings as Partial<Settings> | undefined) ?? {},
        meta: (meta as Meta | undefined) ?? { ...EMPTY_META },
      };
    },
    async putEvent(ev) {
      await conn.put('events', ev);
    },
    async putEvents(evs) {
      const tx = conn.transaction('events', 'readwrite');
      await Promise.all([...evs.map((ev) => tx.store.put(ev)), tx.done]);
    },
    async deleteEvent(id) {
      await conn.delete('events', id);
    },
    async replaceAll(data) {
      const tx = conn.transaction(['events', 'meta'], 'readwrite');
      const events = tx.objectStore('events');
      await events.clear();
      await Promise.all([
        ...data.events.map((ev) => events.put(ev)),
        tx.objectStore('meta').put(data.settings, 'settings'),
        tx.done,
      ]);
    },
    async putSettings(s) {
      await conn.put('meta', s, 'settings');
    },
    async putMeta(m) {
      await conn.put('meta', m, 'meta');
    },
    async clearAll() {
      const tx = conn.transaction(['events', 'drafts', 'meta'], 'readwrite');
      await Promise.all([
        tx.objectStore('events').clear(),
        tx.objectStore('drafts').clear(),
        tx.objectStore('meta').clear(),
        tx.done,
      ]);
    },
    async getDraft(kind) {
      return (await conn.get('drafts', kind)) ?? null;
    },
    async putDraft(d) {
      await conn.put('drafts', d);
    },
    async deleteDraft(kind) {
      await conn.delete('drafts', kind);
    },
  };
}
