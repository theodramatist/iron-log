// Automatic backup to a private GitHub repository he owns (SPEC.md section 8,
// Q25). The one thing that ever leaves the phone, and only when he sets it up:
// the same backup file Export makes, written to one path, so every backup is a
// commit and every version is kept. The token stays in meta and is never in a
// backup file.

import { serializeBackup, type BackupFile, type RemoteBackup, type Repository } from '../data';
import { nowIso } from './clock';

const API = 'https://api.github.com';
export const BACKUP_PATH = 'iron-log-backup.json';

export type PushResult = { ok: true } | { ok: false; offline: boolean; message: string };

/** "you/iron-log-backups", or a github.com link to it. */
export function parseRepo(text: string): { owner: string; name: string } | null {
  const m = /^\s*(?:https?:\/\/github\.com\/)?([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9._-]+?)(?:\.git)?\/?\s*$/.exec(text);
  return m ? { owner: m[1]!, name: m[2]! } : null;
}

/** UTF-8 text as base64, which the contents API takes. */
export function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function problem(status: number): string {
  if (status === 401) return 'GitHub turned down the token. It may have expired.';
  if (status === 403) return "The token can't write to that repository. It needs Contents: Read and write.";
  if (status === 404) return "GitHub can't find that repository with this token.";
  if (status === 409) return 'GitHub saw a newer copy. The next backup will try again.';
  return `GitHub answered with an error (${status}).`;
}

function headers(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token.trim()}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
}

/** Before the first backup: the repository has to exist, be reachable with the token, and be private. */
export async function checkRepo(repo: string, token: string, fetchFn: typeof fetch = fetch): Promise<PushResult> {
  const r = parseRepo(repo);
  if (!r) return { ok: false, offline: false, message: 'Enter the repository as owner/name, such as you/iron-log-backups.' };
  try {
    const res = await fetchFn(`${API}/repos/${r.owner}/${r.name}`, { headers: headers(token), cache: 'no-store' });
    if (res.status !== 200) return { ok: false, offline: false, message: problem(res.status) };
    const body = (await res.json()) as { private?: boolean };
    if (body.private !== true) return { ok: false, offline: false, message: 'That repository is public. Make it private first, or choose a private one.' };
    return { ok: true };
  } catch {
    return { ok: false, offline: true, message: 'No connection right now.' };
  }
}

/** Write the backup to the repository: one commit, replacing the file if it's there. */
export async function pushBackup(remote: Pick<RemoteBackup, 'repo' | 'token'>, text: string, message: string, fetchFn: typeof fetch = fetch): Promise<PushResult> {
  const r = parseRepo(remote.repo);
  if (!r) return { ok: false, offline: false, message: 'Enter the repository as owner/name, such as you/iron-log-backups.' };
  const url = `${API}/repos/${r.owner}/${r.name}/contents/${BACKUP_PATH}`;
  try {
    const found = await fetchFn(url, { headers: headers(remote.token), cache: 'no-store' });
    let sha: string | undefined;
    if (found.status === 200) sha = ((await found.json()) as { sha?: string }).sha;
    else if (found.status !== 404) return { ok: false, offline: false, message: problem(found.status) };
    const put = await fetchFn(url, {
      method: 'PUT',
      headers: { ...headers(remote.token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, content: toBase64(text), ...(sha ? { sha } : {}) }),
    });
    if (put.status === 200 || put.status === 201) return { ok: true };
    return { ok: false, offline: false, message: problem(put.status) };
  } catch {
    return { ok: false, offline: true, message: 'No connection right now.' };
  }
}

/** What a backup holds, apart from when it was made. */
export async function backupHash(file: BackupFile): Promise<string> {
  const bytes = new TextEncoder().encode(serializeBackup({ ...file, exportedAt: '' }));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Back up if the log changed since the last good backup. `force` retries
 * after a failure even when nothing changed, as on coming back to the app.
 * Returns what happened, for Settings' "Back up now."
 */
export async function backUpIfChanged(
  repo: Repository,
  opts: { force?: boolean; failedHash?: { value: string | null } } = {},
  fetchFn: typeof fetch = fetch,
): Promise<'unchanged' | 'saved' | 'failed' | 'offline' | 'off'> {
  const remote = repo.meta().remote;
  if (!remote) return 'off';
  const file = repo.backup();
  const hash = await backupHash(file);
  if (hash === remote.lastHash) return 'unchanged';
  if (!opts.force && opts.failedHash?.value === hash) return 'failed';
  const res = await pushBackup(remote, serializeBackup(file), `Iron Log backup, ${file.exportedAt.slice(0, 16).replace('T', ' ')} UTC`, fetchFn);
  const now = repo.meta().remote;
  if (!now || now.repo !== remote.repo || now.token !== remote.token) return 'off';
  if (res.ok) {
    if (opts.failedHash) opts.failedHash.value = null;
    await repo.setRemote({ ...now, lastAt: nowIso(), lastHash: hash, lastError: null });
    return 'saved';
  }
  if (res.offline) return 'offline';
  if (opts.failedHash) opts.failedHash.value = hash;
  if (now.lastError !== res.message) await repo.setRemote({ ...now, lastError: res.message });
  return 'failed';
}

/**
 * Back up a few seconds after the log changes, when the app comes back to the
 * screen, and when the phone gets a signal again. Returns a stop function.
 */
export function watchAutoBackup(repo: Repository): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let again = false;
  const failedHash = { value: null as string | null };
  const run = async (force: boolean) => {
    if (!repo.meta().remote || !navigator.onLine) return;
    if (running) {
      again = true;
      return;
    }
    running = true;
    try {
      await backUpIfChanged(repo, { force, failedHash });
    } finally {
      running = false;
      if (again) {
        again = false;
        schedule(false, 2000);
      }
    }
  };
  const schedule = (force: boolean, ms: number) => {
    clearTimeout(timer);
    timer = setTimeout(() => void run(force), ms);
  };
  const unsubscribe = repo.subscribe(() => schedule(false, 5000));
  const onVisible = () => {
    if (document.visibilityState === 'visible') schedule(true, 1500);
  };
  const onOnline = () => schedule(true, 1500);
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('online', onOnline);
  schedule(true, 3000);
  return () => {
    clearTimeout(timer);
    unsubscribe();
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('online', onOnline);
  };
}
