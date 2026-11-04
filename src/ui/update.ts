// Service worker updates (SPEC.md section 7): prompt rather than reload, and
// never reload during a session. Today shows "Update ready"; the update
// applies at the next launch, or at once from Today's "Update now".

import { useEffect, useState } from 'preact/hooks';

let apply: ((reload?: boolean) => Promise<void>) | null = null;
const listeners = new Set<() => void>();

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
