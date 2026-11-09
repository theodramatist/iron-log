// The automatic backup to a private GitHub repository (SPEC.md section 8, Q25),
// against a stand-in for GitHub's contents API.
import { describe, expect, it } from 'vitest';
import { createRepository, memoryAdapter, serializeBackup, type Repository } from '../src/data';
import { backUpIfChanged, BACKUP_PATH, checkRepo, parseRepo, pushBackup, toBase64 } from '../src/ui/githubBackup';
import { PROGRAM, buildLog } from './helpers/log';

const TOKEN = 'github_pat_example_0123456789';
const fromBase64 = (b64: string) => new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: { message: string; content: string; sha?: string } | null;
}

/** A stand-in GitHub: one private repository holding at most one file. */
function fakeGitHub(opts: { private?: boolean; status?: number } = {}) {
  const calls: Call[] = [];
  let file: { sha: string; text: string } | null = null;
  let n = 0;
  const fetchFn = (async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    const body = init.body ? (JSON.parse(init.body as string) as Call['body']) : null;
    calls.push({ url, method, headers: init.headers as Record<string, string>, body });
    if (opts.status) return new Response('{}', { status: opts.status });
    if (url.endsWith('/repos/you/iron-log-backups')) return Response.json({ private: opts.private ?? true });
    if (!url.endsWith(`/contents/${BACKUP_PATH}`)) return new Response('{}', { status: 404 });
    if (method === 'GET') return file ? Response.json({ sha: file.sha }) : new Response('{}', { status: 404 });
    if (file && body?.sha !== file.sha) return new Response('{}', { status: 409 });
    file = { sha: `sha-${++n}`, text: fromBase64(body!.content) };
    return Response.json({}, { status: n === 1 ? 201 : 200 });
  }) as typeof fetch;
  return { calls, fetchFn, file: () => file };
}

async function loggedRepo(): Promise<Repository> {
  let t = Date.parse('2026-11-10T18:00:00.000Z');
  let id = 0;
  const repo = createRepository(memoryAdapter(), PROGRAM, { clock: { nowIso: () => new Date((t += 1000)).toISOString() }, makeId: () => `id-${++id}` });
  await repo.load();
  await repo.addEvents(buildLog().cond('2026-11-03').events);
  return repo;
}

describe('Automatic backup to GitHub', () => {
  it('reads a repository as owner/name or a github.com link', () => {
    expect(parseRepo('you/iron-log-backups')).toEqual({ owner: 'you', name: 'iron-log-backups' });
    expect(parseRepo(' https://github.com/you/iron-log-backups.git ')).toEqual({ owner: 'you', name: 'iron-log-backups' });
    expect(parseRepo('iron-log-backups')).toBeNull();
    expect(parseRepo('you/iron log')).toBeNull();
  });

  it('sends UTF-8 text intact', () => {
    const text = '{"label":"3–4 reps left","w":"2×5"}';
    expect(fromBase64(toBase64(text))).toBe(text);
  });

  it('checks that the repository is private before the first backup', async () => {
    expect(await checkRepo('you/iron-log-backups', TOKEN, fakeGitHub().fetchFn)).toEqual({ ok: true });
    expect(await checkRepo('you/iron-log-backups', TOKEN, fakeGitHub({ private: false }).fetchFn)).toMatchObject({ ok: false, message: expect.stringContaining('public') });
    expect(await checkRepo('you/other', TOKEN, fakeGitHub().fetchFn)).toMatchObject({ ok: false, message: expect.stringContaining("can't find") });
  });

  it('creates the file, then replaces it, as one commit each', async () => {
    const gh = fakeGitHub();
    const remote = { repo: 'you/iron-log-backups', token: TOKEN };
    expect(await pushBackup(remote, '{"a":1}', 'first', gh.fetchFn)).toEqual({ ok: true });
    expect(await pushBackup(remote, '{"a":2}', 'second', gh.fetchFn)).toEqual({ ok: true });
    const puts = gh.calls.filter((c) => c.method === 'PUT');
    expect(puts.map((c) => [c.url, c.body?.sha ?? null])).toEqual([
      [`https://api.github.com/repos/you/iron-log-backups/contents/${BACKUP_PATH}`, null],
      [`https://api.github.com/repos/you/iron-log-backups/contents/${BACKUP_PATH}`, 'sha-1'],
    ]);
    expect(puts[0]!.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(gh.file()?.text).toBe('{"a":2}');
  });

  it('says what went wrong, and tells a lost signal apart', async () => {
    const remote = { repo: 'you/iron-log-backups', token: TOKEN };
    expect(await pushBackup(remote, '{}', 'x', fakeGitHub({ status: 401 }).fetchFn)).toMatchObject({ ok: false, offline: false, message: expect.stringContaining('expired') });
    expect(await pushBackup(remote, '{}', 'x', fakeGitHub({ status: 403 }).fetchFn)).toMatchObject({ ok: false, message: expect.stringContaining('Read and write') });
    const offline = (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    expect(await pushBackup(remote, '{}', 'x', offline)).toMatchObject({ ok: false, offline: true });
  });

  it('backs up only when the log changed, and keeps the token out of the file', async () => {
    const repo = await loggedRepo();
    const gh = fakeGitHub();
    expect(await backUpIfChanged(repo, {}, gh.fetchFn)).toBe('off');
    await repo.setRemote({ repo: 'you/iron-log-backups', token: TOKEN, lastAt: null, lastHash: null, lastError: null });

    expect(await backUpIfChanged(repo, {}, gh.fetchFn)).toBe('saved');
    expect(repo.meta().remote).toMatchObject({ lastError: null, lastAt: expect.any(String), lastHash: expect.any(String) });
    const sent = JSON.parse(gh.file()!.text) as { app: string; events: unknown[] };
    expect(sent).toMatchObject({ app: 'iron-log' });
    expect(sent.events).toHaveLength(repo.events().length);
    expect(gh.file()!.text).not.toContain(TOKEN);
    expect(serializeBackup(repo.backup())).not.toContain(TOKEN);

    const before = gh.calls.length;
    expect(await backUpIfChanged(repo, {}, gh.fetchFn)).toBe('unchanged');
    expect(gh.calls.length).toBe(before);

    await repo.add({ type: 'bodyweight', date: '2026-11-10', pounds: 266 });
    expect(await backUpIfChanged(repo, {}, gh.fetchFn)).toBe('saved');
    expect(JSON.parse(gh.file()!.text).events).toHaveLength(repo.events().length);
  });

  it('after a failure, waits for a change or a forced retry instead of trying over and over', async () => {
    const repo = await loggedRepo();
    await repo.setRemote({ repo: 'you/iron-log-backups', token: TOKEN, lastAt: null, lastHash: null, lastError: null });
    const failedHash = { value: null as string | null };
    const denied = fakeGitHub({ status: 403 });
    expect(await backUpIfChanged(repo, { failedHash }, denied.fetchFn)).toBe('failed');
    expect(repo.meta().remote?.lastError).toContain('Read and write');
    const calls = denied.calls.length;
    expect(await backUpIfChanged(repo, { failedHash }, denied.fetchFn)).toBe('failed');
    expect(denied.calls.length).toBe(calls);

    const fixed = fakeGitHub();
    expect(await backUpIfChanged(repo, { failedHash, force: true }, fixed.fetchFn)).toBe('saved');
    expect(repo.meta().remote?.lastError).toBeNull();
  });
});
