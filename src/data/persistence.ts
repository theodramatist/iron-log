// Persistent storage (SPEC.md section 7). WebKit grants it by heuristics, such
// as whether the app runs from the home screen, so backups stay required.

export type PersistenceStatus = 'granted' | 'denied' | 'unsupported';

function storageManager(): StorageManager | undefined {
  return typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { storage?: StorageManager }).storage;
}

/** Ask once setup finishes. */
export async function requestPersistentStorage(): Promise<PersistenceStatus> {
  const storage = storageManager();
  if (!storage?.persist) return 'unsupported';
  try {
    return (await storage.persist()) ? 'granted' : 'denied';
  } catch {
    return 'denied';
  }
}

/** For the Settings screen. */
export async function persistentStorageStatus(): Promise<PersistenceStatus> {
  const storage = storageManager();
  if (!storage?.persisted) return 'unsupported';
  try {
    return (await storage.persisted()) ? 'granted' : 'denied';
  } catch {
    return 'denied';
  }
}
