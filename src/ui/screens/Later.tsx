// Week, Progress, Lifts, and Settings arrive in M4 (CLAUDE.md).

import type { Tab } from '../App';

const TITLES: Record<Exclude<Tab, 'today'>, string> = {
  week: 'Week',
  progress: 'Progress',
  lifts: 'Lifts',
  settings: 'Settings',
};

export function Later(props: { tab: Exclude<Tab, 'today'> }) {
  return (
    <main class="screen">
      <h1>{TITLES[props.tab]}</h1>
      <p class="muted">This screen comes in the next build.</p>
    </main>
  );
}
