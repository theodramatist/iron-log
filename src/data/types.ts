// Storage types (SPEC.md sections 2, 4, and 8).

import type { AnyEvent, IsoTimestamp, Settings } from '../engine';

export const APP_ID = 'iron-log';
export const BACKUP_SCHEMA_VERSION = 1;

/** The export format, SPEC.md section 4. */
export interface BackupFile {
  app: typeof APP_ID;
  schemaVersion: typeof BACKUP_SCHEMA_VERSION;
  programVersion: string;
  exportedAt: IsoTimestamp;
  settings: Partial<Settings>;
  events: AnyEvent[];
}

export type DraftKind = 'lifting' | 'conditioning';

/** A half-logged session. Kept apart from the log, so it never changes the plan. */
export interface DraftRecord<T = unknown> {
  kind: DraftKind;
  savedAt: IsoTimestamp;
  data: T;
}

/**
 * Automatic backup to a private GitHub repository he chose (SPEC.md section
 * 8, Q25). It lives in meta, beside the log, so the token is never in an
 * exported file.
 */
export interface RemoteBackup {
  /** "owner/name". */
  repo: string;
  /** A fine-grained token that can read and write that repository's contents, and nothing else. */
  token: string;
  lastAt: IsoTimestamp | null;
  /** A hash of what the last good backup held, so an unchanged log isn't sent again. */
  lastHash: string | null;
  lastError: string | null;
}

export interface Meta {
  /** The last backup file saved by hand, through the share sheet. */
  lastExportAt: IsoTimestamp | null;
  remote?: RemoteBackup | null;
}

export interface StoredData {
  events: AnyEvent[];
  /** Base settings for the engine. Settings normally live in setup and settingsChange events. */
  settings: Partial<Settings>;
  meta: Meta;
}

export interface StorageAdapter {
  /** False when nothing survives a reload (the in-memory fallback). */
  readonly durable: boolean;
  load(): Promise<StoredData>;
  putEvent(ev: AnyEvent): Promise<void>;
  putEvents(evs: AnyEvent[]): Promise<void>;
  deleteEvent(id: string): Promise<void>;
  /** Replace every event and the settings in one transaction. */
  /** Replace the log and settings, and drop any session drafts. */
  replaceAll(data: { events: AnyEvent[]; settings: Partial<Settings> }): Promise<void>;
  putSettings(settings: Partial<Settings>): Promise<void>;
  putMeta(meta: Meta): Promise<void>;
  /** Erase events, settings, drafts, and meta. */
  clearAll(): Promise<void>;
  getDraft(kind: DraftKind): Promise<DraftRecord | null>;
  putDraft(draft: DraftRecord): Promise<void>;
  deleteDraft(kind: DraftKind): Promise<void>;
}

export const EMPTY_META: Meta = { lastExportAt: null };
