// The app shell: storage, first-launch setup, the five tabs, and the session
// screens that open full screen over them (SPEC.md section 5).

import type { ComponentChildren } from 'preact';
import { useEffect, useErrorBoundary, useState } from 'preact/hooks';
import { openRepository, type Repository } from '../data';
import type { Program } from '../engine';
import programJson from '../program/program.json';
import { FlashHost } from './components';
import { ConditioningSession } from './screens/ConditioningSession';
import { Later } from './screens/Later';
import { LiftingSession } from './screens/LiftingSession';
import { Setup } from './screens/Setup';
import { Today } from './screens/Today';
import { CONDITIONING_DRAFT_VERSION, type ConditioningDraft } from './session/conditioning';
import { LIFTING_DRAFT_VERSION, type LiftingDraft } from './session/lifting';
import { AppProvider, useApp } from './store';
import './theme.css';

const PROGRAM = programJson as Program;

export type Tab = 'today' | 'week' | 'progress' | 'lifts' | 'settings';
export type SessionRoute = { kind: 'lifting'; draft: LiftingDraft } | { kind: 'conditioning'; draft: ConditioningDraft };

const TABS: { id: Tab; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Week' },
  { id: 'progress', label: 'Progress' },
  { id: 'lifts', label: 'Lifts' },
  { id: 'settings', label: 'Settings' },
];

export function App() {
  const [repo, setRepo] = useState<Repository | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    openRepository(PROGRAM).then(setRepo, (e: unknown) => setFailed(e instanceof Error ? e.message : String(e)));
  }, []);
  if (failed) {
    return (
      <main class="screen">
        <h1>Iron Log</h1>
        <p class="note alarm">Storage didn't open: {failed}</p>
      </main>
    );
  }
  if (!repo) return null;
  return (
    <AppProvider repo={repo} program={PROGRAM}>
      <Guard>
        <Shell />
      </Guard>
    </AppProvider>
  );
}

/** A render error shows a way back instead of a blank screen. Drafts are already saved. */
function Guard(props: { children: ComponentChildren }) {
  const [error] = useErrorBoundary();
  if (error) {
    return (
      <main class="screen">
        <h1>Iron Log</h1>
        <p class="note alarm">Something went wrong: {error instanceof Error ? error.message : String(error)}</p>
        <p>Any session in progress is saved. Reload to pick up where you left off.</p>
        <button type="button" class="btn btn-primary" onClick={() => location.reload()}>
          Reload
        </button>
      </main>
    );
  }
  return <>{props.children}</>;
}

function Shell() {
  const { repo } = useApp();
  const [tab, setTab] = useState<Tab>('today');
  const [session, setSession] = useState<SessionRoute | null>(null);
  const setUp = repo.events().some((e) => e.type === 'setup');

  // A draft survives the app being closed (SPEC.md section 3): reopen it.
  useEffect(() => {
    let live = true;
    void (async () => {
      const lifting = await repo.getDraft<LiftingDraft>('lifting');
      if (!live) return;
      if (lifting?.data.v === LIFTING_DRAFT_VERSION) return setSession({ kind: 'lifting', draft: lifting.data });
      const cond = await repo.getDraft<ConditioningDraft>('conditioning');
      if (live && cond?.data.v === CONDITIONING_DRAFT_VERSION) setSession({ kind: 'conditioning', draft: cond.data });
    })();
    return () => {
      live = false;
    };
  }, [repo]);

  if (!setUp) {
    return (
      <>
        <Setup />
        <FlashHost />
      </>
    );
  }

  return (
    <>
      <div aria-hidden={session ? 'true' : undefined}>
        {tab === 'today' ? <Today onStart={setSession} /> : <Later tab={tab} />}
        <nav class="tabbar" aria-label="Tabs">
          {TABS.map((t) => (
            <button type="button" key={t.id} aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
      </div>
      {session?.kind === 'lifting' && <LiftingSession initial={session.draft} onClose={() => setSession(null)} />}
      {session?.kind === 'conditioning' && <ConditioningSession initial={session.draft} onClose={() => setSession(null)} />}
      <FlashHost />
    </>
  );
}
