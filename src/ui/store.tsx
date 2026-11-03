// App-wide state: the repository, today's date, and the engine input. Every
// change to the log bumps the repository's version, and the screens replay
// from that (SPEC.md section 2).

import { createContext, type ComponentChildren } from 'preact';
import { useContext, useEffect, useMemo, useState } from 'preact/hooks';
import type { NewEvent, Repository } from '../data';
import type { AnyEvent, EngineInput, LocalDate, Program } from '../engine';
import { currentDate } from './clock';

export interface AppValue {
  repo: Repository;
  program: Program;
  today: LocalDate;
  version: number;
  input: EngineInput;
  /** Log an event. The repository stamps its ID and timestamps. */
  log(ev: NewEvent): Promise<AnyEvent>;
}

const AppContext = createContext<AppValue | null>(null);

export function useApp(): AppValue {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp needs an AppProvider');
  return value;
}

function useRepoVersion(repo: Repository): number {
  const [version, setVersion] = useState(repo.version());
  useEffect(() => repo.subscribe(() => setVersion(repo.version())), [repo]);
  return version;
}

/** Today's date, refreshed when the app comes back to the foreground and once a minute. */
function useToday(): LocalDate {
  const [today, setToday] = useState(currentDate);
  useEffect(() => {
    const refresh = () => setToday(currentDate());
    const timer = window.setInterval(refresh, 60_000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  return today;
}

export function AppProvider(props: { repo: Repository; program: Program; children: ComponentChildren }) {
  const { repo, program } = props;
  const version = useRepoVersion(repo);
  const today = useToday();
  const value = useMemo<AppValue>(
    () => ({ repo, program, today, version, input: repo.input(today), log: (ev) => repo.add(ev) }),
    [repo, program, today, version],
  );
  return <AppContext.Provider value={value}>{props.children}</AppContext.Provider>;
}
