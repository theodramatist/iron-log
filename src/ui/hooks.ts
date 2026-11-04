import { useEffect, useState } from 'preact/hooks';

/** The wall clock, refreshed every `ms` while `active`. Timers compute from timestamps, so a late tick never drifts. */
export function useNow(ms = 1000, active = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(Date.now());
    tick();
    const timer = window.setInterval(tick, ms);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [ms, active]);
  return now;
}
