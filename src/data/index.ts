// The data layer: storage, backups, drafts, and persistence (SPEC.md section 2).

import type { Program } from '../engine';
import { idbAdapter } from './idbAdapter';
import { memoryAdapter } from './memoryAdapter';
import { createRepository, type Repository } from './repository';

export * from './types';
export { memoryAdapter } from './memoryAdapter';
export { DB_NAME, DB_VERSION, idbAdapter } from './idbAdapter';
export { EVENT_TYPES, backupFileName, buildBackup, parseBackup, serializeBackup, type ParseResult } from './backup';
export { createRepository, systemClock, type Clock, type NewEvent, type Repository } from './repository';
export { persistentStorageStatus, requestPersistentStorage, type PersistenceStatus } from './persistence';

/** Today's date on the phone's own clock, as a local calendar date. */
export function localDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Open the app's storage. Falls back to memory, which `durable: false`
 * reports, when IndexedDB can't open (for example, a locked-down private window).
 */
export async function openRepository(program: Program): Promise<Repository> {
  let repo: Repository;
  try {
    repo = createRepository(await idbAdapter(), program);
  } catch {
    repo = createRepository(memoryAdapter(), program);
  }
  await repo.load();
  return repo;
}
