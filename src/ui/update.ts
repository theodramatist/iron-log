// Service worker updates (SPEC.md section 7). The app looks for a new version
// whenever it opens or comes back to the screen, and from Settings' "Check for
// updates." A new version applies on its own at those moments, never during a
// session or setup. One that finishes downloading while he's using the app
// shows "Update ready" and applies the next time he comes back, or at once
// from "Update now."

import { useEffect, useState } from 'preact/hooks';

let apply: ((reload?: boolean) => Promise<void>) | null = null;
const listeners = new Set<() => void>();

// A session or setup on screen holds an update back.
let busy = false;
// When the app last opened or came back to the screen.
let shownAt = Date.now();
// An update that finishes downloading this soon after he opens the app applies at once.
const JUST_OPENED_MS = 20_000;

/** App reports whether a session or setup is on screen. */
export function setUpdateBusy(value: boolean): void {
  busy = value;
}

function applyIfQuiet(): boolean {
  if (!apply || busy) return false;
  void apply(true);
  return true;
}

export type UpdateCheck = 'found' | 'latest' | 'offline' | 'unavailable';
let check: (() => Promise<UpdateCheck>) | null = null;

/**
 * iOS resumes a Home Screen app without reloading it, so the browser's own
 * update check, which runs on a page load, can go days without running.
 * Check whenever the app comes back to the screen, and hourly while it's
 * open. The check downloads sw.js and sends nothing.
 */
export function watchForUpdates(reg: ServiceWorkerRegistration): void {
  const run = async (): Promise<UpdateCheck> => {
    if (reg.waiting || reg.installing) return 'found';
    if (!navigator.onLine) return 'offline';
    try {
      await reg.update();
    } catch {
      return 'offline';
    }
    return reg.installing || reg.waiting ? 'found' : 'latest';
  };
  check = run;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    shownAt = Date.now();
    if (!applyIfQuiet()) void run();
  });
  setInterval(() => void run(), 60 * 60 * 1000);
}

/** Settings' "Check for updates." */
export function checkForUpdate(): Promise<UpdateCheck> {
  return check ? check() : Promise.resolve('unavailable');
}

/** Called when a new version has installed and is waiting. */
export function markUpdateReady(update: (reload?: boolean) => Promise<void>): void {
  apply = update;
  if (Date.now() - shownAt < JUST_OPENED_MS && applyIfQuiet()) return;
  for (const fn of listeners) fn();
}

/** The "Update now" action once an update is waiting, or null. */
export function useUpdateReady(): (() => void) | null {
  const [, rerender] = useState(0);
  useEffect(() => {
    const fn = () => rerender((n) => n + 1);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return apply ? () => void apply?.(true) : null;
}
