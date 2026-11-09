// Week (SPEC.md section 5.5): Monday through Sunday, with arrows for other
// weeks. Each day shows its plan or what was logged, and a logged session
// opens to view, edit, or delete.

import { useMemo, useState } from 'preact/hooks';
import { addDays, programWeek, weekStart, weekSummary, type DayPlan, type LocalDate } from '../../engine';
import { shortDate, weekRange, weekdayShort } from '../format';
import { useApp } from '../store';
import { SessionDetail, type LoggedSession } from './history/SessionDetail';

export function Week() {
  const { input, today, program, repo } = useApp();
  const [monday, setMonday] = useState<LocalDate>(() => weekStart(today));
  const week = useMemo(() => weekSummary(input, monday), [input, monday]);
  const [openId, setOpenId] = useState<string | null>(null);
  const first = weekStart(program.athlete.startDate);
  const open = openId ? (repo.events().find((e) => e.id === openId) as LoggedSession | undefined) : undefined;
  const stopped = repo
    .events()
    .filter((e): e is LoggedSession => (e.type === 'liftingSession' || e.type === 'conditioningSession') && e.stopped === true);
  const tag = week.weekType === 'light' ? ' · Light week' : week.weekType === 'floor' ? ' · Floor week' : '';

  return (
    <main class="screen">
      <div class="eyebrow">
        Week <b>{programWeek(monday, program.athlete.startDate)}</b>
        {tag}
      </div>
      <div class="spread">
        <button type="button" class="icon-btn" aria-label="Previous week" disabled={monday <= first} onClick={() => setMonday(addDays(monday, -7))}>
          ‹
        </button>
        <h1 style={{ margin: 0, textAlign: 'center' }}>{weekRange(monday, addDays(monday, 6))}</h1>
        <button type="button" class="icon-btn" aria-label="Next week" onClick={() => setMonday(addDays(monday, 7))}>
          ›
        </button>
      </div>
      {monday !== weekStart(today) && (
        <button type="button" class="btn-quiet" onClick={() => setMonday(weekStart(today))}>
          Back to this week
        </button>
      )}

      {week.days.map((d) => (
        <DayCard key={d.date} day={d} today={today} stopped={stopped.filter((e) => e.date === d.date)} onOpen={setOpenId} />
      ))}

      <div class="card">
        <div class="spread">
          <span class="small muted">Lifting sessions</span>
          <span class="num">{week.liftingDone}</span>
        </div>
        <div class="spread">
          <span class="small muted">Conditioning</span>
          <span class="num">
            {week.conditioningMinutes} of {week.conditioningTargetMinutes} min
          </span>
        </div>
      </div>

      {open && <SessionDetail event={open} onClose={() => setOpenId(null)} />}
    </main>
  );
}

function statusText(d: DayPlan, today: LocalDate): string {
  if (d.status === 'done') return 'Done';
  if (d.status === 'skipped') return 'Skipped';
  if (d.kind === 'sick') return 'Sick';
  if (d.kind === 'off') return 'Off';
  if (d.status === 'missed') return 'Missed';
  return d.date === today ? 'Today' : 'Planned';
}

function DayCard(props: { day: DayPlan; today: LocalDate; stopped: LoggedSession[]; onOpen: (id: string) => void }) {
  const { day: d, today } = props;
  const logged: LoggedSession[] = [...d.loggedLifting, ...d.loggedConditioning, ...d.extraConditioning, ...props.stopped];
  const planned = d.status !== 'done' && d.status !== 'skipped' && (d.kind === 'lifting' || d.kind === 'conditioning');
  return (
    <section class={d.date === today ? 'card day today' : 'card day'} aria-label={shortDate(d.date)}>
      <div class="spread">
        <span class="question-text">
          {weekdayShort(d.date)} <span class="muted num small">{shortDate(d.date).replace(/^\w+, /, '')}</span>
        </span>
        <span class={d.status === 'done' ? 'stage' : 'small muted'}>{statusText(d, today)}</span>
      </div>
      {d.calendarNote && <p class="cue">{d.calendarNote}</p>}
      {logged.map((e) => (
        <button type="button" class="logged" key={e.id} onClick={() => props.onOpen(e.id)}>
          <span>{loggedTitle(e)}</span>
          <span class="small muted">{loggedLine(e)}</span>
        </button>
      ))}
      {planned && d.kind === 'lifting' && (
        <ul class="lines">
          <li class="muted">Workout {d.workout}</li>
          {d.projected ? (
            <li class="small muted">Weights are set by the session before it.</li>
          ) : (
            d.summary.map((s) => (
              <li class="small" key={s}>
                {s}
              </li>
            ))
          )}
        </ul>
      )}
      {planned && d.kind === 'conditioning' && d.conditioning && (
        <ul class="lines">
          <li class="small">
            {d.conditioning.targetMinutes} min easy{d.conditioning.intervals > 0 ? ` · ${d.conditioning.intervals} intervals` : ''}
          </li>
        </ul>
      )}
    </section>
  );
}

function loggedTitle(e: LoggedSession): string {
  if (e.stopped) return 'Stopped session';
  if (e.type === 'conditioningSession' && e.extra) return 'Extra minutes';
  return e.type === 'liftingSession' ? `Workout ${e.workout}` : 'Conditioning';
}

function loggedLine(e: LoggedSession): string {
  if (e.type === 'conditioningSession') {
    return `${e.actualMinutes} min${e.intervalsDone > 0 ? ` · ${e.intervalsDone} intervals` : ''}`;
  }
  const done = e.lifts.filter((l) => l.sets.some((s) => !s.skipped)).length;
  return `${done} ${done === 1 ? 'lift' : 'lifts'} logged · tap to view or edit`;
}
