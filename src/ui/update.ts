// Service worker updates (SPEC.md section 7): prompt rather than reload, and
// never reload during a session. Today shows "Update ready"; the update
// applies at the next launch, or at once from "Update now" on Today or in
// Settings. The app looks for a new version whenever it comes back to the
// screen, and from Settings' "Check for updates."

import { useEffect, useState } from 'preact/hooks';

let apply: ((reload?: boolean) => Promise<void>) | null = null;
const listeners = new Set<() => void>();

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
    if (document.visibilityState === 'visible') void run();
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
