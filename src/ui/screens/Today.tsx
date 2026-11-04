// Today (SPEC.md section 5.2).

import { useMemo, useState } from 'preact/hooks';
import {
  addDays,
  conditioningState,
  planFor,
  triggers,
  weekdayIndex,
  weekStart,
  weekSummary,
  type AnyEvent,
  type Banner,
  type DayPlan,
  type LocalDate,
  type Program,
  type WeekSummary,
} from '../../engine';
import { localDate } from '../../data';
import { unlockAudio } from '../alerts';
import { backupReminderDue, exportBackup } from '../backups';
import { useUpdateReady } from '../update';
import { nowIso } from '../clock';
import { Choice, Confirm, Sheet, YesNo } from '../components';
import { longDate, shortDate, weekdayLong, weekdayShort } from '../format';
import { newConditioningDraft } from '../session/conditioning';
import { newLiftingDraft } from '../session/lifting';
import { useApp } from '../store';
import type { SessionRoute } from '../App';

const CONSECUTIVE = 'Lifting two days in a row cuts recovery. Lift anyway?';

export function Today(props: { onStart: (route: SessionRoute) => void }) {
  const app = useApp();
  const { program, today, input, repo } = app;
  const day = useMemo(() => planFor(input, today), [input, today]);
  const week = useMemo(() => weekSummary(input, weekStart(today)), [input, today]);
  const phase = useMemo(() => conditioningState(input, today).phase, [input, today]);
  const [confirm, setConfirm] = useState<null | { kind: 'lifting' | 'conditioning'; past: LocalDate | null }>(null);
  const [menu, setMenu] = useState(false);
  const [past, setPast] = useState(false);
  const stoppedToday = repo.events().some((e) => (e.type === 'liftingSession' || e.type === 'conditioningSession') && e.stopped && e.date === today);

  const begin = async (kind: 'lifting' | 'conditioning', date: LocalDate, isPast: boolean) => {
    unlockAudio();
    if (kind === 'lifting') {
      // The session clock starts at "Start session" (RULES.md section 14).
      const draft = { ...newLiftingDraft(date, isPast), startedAt: isPast ? null : nowIso() };
      await repo.saveDraft('lifting', draft);
      props.onStart({ kind: 'lifting', draft });
    } else {
      const draft = newConditioningDraft(date, isPast);
      await repo.saveDraft('conditioning', draft);
      props.onStart({ kind: 'conditioning', draft });
    }
  };

  const tryStart = (kind: 'lifting' | 'conditioning') => {
    const consecutive = kind === 'lifting' && repo.events().some((e) => e.type === 'liftingSession' && !e.stopped && e.date === addDays(today, -1));
    if (consecutive) setConfirm({ kind, past: null });
    else void begin(kind, today, false);
  };

  const doneToday = day.status === 'done';
  const update = useUpdateReady();
  const [another, setAnother] = useState(false);
  // The day's main action sits at the bottom, in reach of a thumb (SPEC.md section 6).
  const primary =
    day.kind === 'sick' ? (
      <button type="button" class="btn btn-primary" onClick={() => void app.log({ type: 'illness', date: today, kind: 'better' })}>
        I'm better
      </button>
    ) : !doneToday && day.kind !== 'off' && day.status !== 'skipped' ? (
      <button type="button" class="btn btn-primary" onClick={() => tryStart(day.kind as 'lifting' | 'conditioning')}>
        Start session
      </button>
    ) : null;
  const caps = weekCaps(program, week, today);

  return (
    <main class={primary ? 'screen has-action' : 'screen'}>
      <div class="eyebrow">
        Week <b>{day.programWeek}</b> · Conditioning phase <b>{phase}</b>
      </div>
      <h1>{longDate(today)}</h1>

      {update && (
        <div class="note info" role="status">
          <div>Update ready. It takes effect the next time you open Iron Log.</div>
          <div class="btn-row">
            <button type="button" class="chip" onClick={update}>
              Update now
            </button>
          </div>
        </div>
      )}
      {stoppedToday && <div class="note alarm">{program.safety.stopSessionMessage}</div>}
      <Banners banners={day.banners.slice(0, 2)} />
      {day.banners.length < 2 && <BackupReminder />}

      <SessionCard day={day} week={week} onUndo={() => day.skipId && void repo.remove(day.skipId)} />

      {weekdayIndex(today) === 5 && day.kind === 'lifting' && day.status === 'planned' && (
        <div class="btn-row">
          <button type="button" class="btn btn-ghost" onClick={() => void app.log({ type: 'skip', date: today, kind: 'lifting', reason: 'time' })}>
            Move it to Sunday
          </button>
        </div>
      )}
      <div class="btn-row">
        {day.kind !== 'sick' && !doneToday && day.swapTo && (
          <button type="button" class="btn btn-ghost" onClick={() => tryStart(day.swapTo!)}>
            Swap today: {day.swapTo === 'lifting' ? 'lifting' : 'conditioning'}
          </button>
        )}
        {day.kind !== 'sick' && (
          <button type="button" class="btn btn-ghost" onClick={() => setMenu(true)}>
            Something came up
          </button>
        )}
      </div>
      {doneToday && (caps.lifting || caps.conditioning) && (
        <button type="button" class="btn-quiet" onClick={() => setAnother(true)}>
          Log another session today
        </button>
      )}

      <h2>This week</h2>
      <WeekStrip days={week.days.filter((d, i) => i < 5 || d.kind !== 'off' || d.status === 'done')} today={today} />
      <div class="card">
        <div class="spread">
          <span class="small muted">Conditioning this week</span>
          <span class="num">
            {week.conditioningMinutes} of {week.conditioningTargetMinutes} min
          </span>
        </div>
        <div class="meter" role="img" aria-label={`${week.conditioningMinutes} of ${week.conditioningTargetMinutes} minutes`}>
          <i style={{ width: `${Math.min(100, (100 * week.conditioningMinutes) / week.conditioningTargetMinutes)}%` }} />
        </div>
      </div>
      {day.foodLines.length > 0 && (
        <div class="note ok">
          {day.foodLines.map((l) => (
            <div key={l}>{l}</div>
          ))}
        </div>
      )}

      <button type="button" class="btn-quiet" onClick={() => setPast(true)}>
        Log a past session
      </button>

      {confirm && (
        <Confirm
          title="Lift again?"
          message={CONSECUTIVE}
          confirm="Lift anyway"
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            const c = confirm;
            setConfirm(null);
            void begin(c.kind, c.past ?? today, c.past !== null);
          }}
        />
      )}
      {menu && <SomethingCameUp day={day} onClose={() => setMenu(false)} />}
      {another && (
        <Sheet title="Another session today" onClose={() => setAnother(false)}>
          <p class="note">A session is already logged today. Two on one day is allowed.</p>
          <div class="stack">
            {caps.lifting && (
              <button
                type="button"
                class="btn btn-ghost"
                onClick={() => {
                  setAnother(false);
                  tryStart('lifting');
                }}
              >
                Lifting
              </button>
            )}
            {caps.conditioning && (
              <button
                type="button"
                class="btn btn-ghost"
                onClick={() => {
                  setAnother(false);
                  tryStart('conditioning');
                }}
              >
                Conditioning
              </button>
            )}
            <button type="button" class="btn-quiet" onClick={() => setAnother(false)}>
              Cancel
            </button>
          </div>
        </Sheet>
      )}
      {primary && (
        <div class="action-bar">
          <div class="action-inner">{primary}</div>
        </div>
      )}
      {past && (
        <PastEntry
          onClose={() => setPast(false)}
          onStart={(kind, date) => {
            setPast(false);
            void begin(kind, date, true);
          }}
        />
      )}
    </main>
  );
}

/**
 * Whether another session of each kind fits this week (RULES.md sections 1
 * and 10). Weekends offer none.
 */
function weekCaps(program: Program, week: WeekSummary, today: LocalDate): { lifting: boolean; conditioning: boolean } {
  if (weekdayIndex(today) >= 5) return { lifting: false, conditioning: false };
  const floor = week.weekType === 'floor';
  const liftCap = floor ? program.deload.floorWeek.maxLiftingSessions : program.schedule.maxLiftingSessionsPerWeek;
  const condCap = floor ? 0 : program.schedule.maxConditioningSessionsPerWeek;
  return { lifting: week.liftingDone < liftCap, conditioning: week.conditioningDone < condCap };
}

// ------------------------------------------------------------ session card

function SessionCard(props: { day: DayPlan; week: WeekSummary; onUndo: () => void }) {
  const { program } = useApp();
  const { day } = props;
  const weekTag = day.weekType === 'light' ? 'Light week' : day.weekType === 'floor' ? 'Floor week' : null;
  const done = day.status === 'done';
  const skipped = day.status === 'skipped';
  const movedTo = props.week.days.find((d) => d.date > day.date && d.kind === 'lifting' && d.status === 'planned');
  const restMoved = movedTo !== undefined && props.week.days.some((d) => d.date > movedTo.date && d.status === 'planned');
  return (
    <section class={done ? 'card done' : 'card'} aria-label="Today's session">
      <div class="spread">
        <div>
          <div class="card-kicker">{[weekTag, day.calendarNote].filter(Boolean).join(' · ') || 'Today'}</div>
          <div class="card-title">{cardTitle(day)}</div>
        </div>
        {done && <span class="stage">Done</span>}
      </div>
      {day.kind === 'sick' && <p>{program.illness.sickModeMessage}</p>}
      {skipped && (
        <>
          <p class="muted">
            No time today.{' '}
            {day.kind === 'conditioning'
              ? "This conditioning session isn't made up."
              : movedTo
                ? `The session moved to ${weekdayLong(movedTo.date)}${restMoved ? ', and the rest of the week moved with it' : ''}.`
                : "The week ends today, so this session isn't made up. The next one picks up where you left off."}
          </p>
          <div class="btn-row">
            <button type="button" class="chip" onClick={props.onUndo}>
              Undo
            </button>
          </div>
        </>
      )}
      {day.kind === 'off' && !done && <p class="muted">{day.message ?? 'Off.'}</p>}
      {day.summary.length > 0 && (
        <ul class="lines">
          {day.summary.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      )}
      {day.kind === 'conditioning' && !done && day.conditioning && (
        <ul class="lines">
          <li>
            {day.conditioning.targetMinutes} min easy · {day.conditioning.machines.easy}
          </li>
          {day.conditioning.intervals > 0 && (
            <li>
              {day.conditioning.intervals} intervals · {day.conditioning.machines.intervals}
            </li>
          )}
          {day.conditioning.noIntervalsReason && <li class="muted">{day.conditioning.noIntervalsReason}</li>}
        </ul>
      )}
      {done &&
        day.loggedConditioning.map((c) => (
          <ul class="lines" key={c.id}>
            <li>
              {c.actualMinutes} min{c.intervalsDone > 0 ? ` · ${c.intervalsDone} intervals` : ''}
            </li>
          </ul>
        ))}
      {day.notes.map((n) => (
        <p class="cue" key={n}>
          {n}
        </p>
      ))}
    </section>
  );
}

function cardTitle(day: DayPlan): string {
  if (day.kind === 'sick') return 'Sick';
  if (day.status === 'skipped') return day.kind === 'lifting' ? 'Lifting skipped' : 'Conditioning skipped';
  if (day.status === 'done') return day.loggedLifting.length > 0 ? `Workout ${day.workout ?? ''}`.trim() : 'Conditioning';
  if (day.kind === 'lifting') return `Workout ${day.workout}`;
  if (day.kind === 'conditioning') return 'Conditioning';
  return 'Off';
}

// ------------------------------------------------------------ banners

/** At most two show, in the engine's priority order (SPEC.md section 5.2). */
function Banners(props: { banners: Banner[] }) {
  return (
    <>
      {props.banners.slice(0, 2).map((b) => (
        <BannerView key={`${b.kind}-${b.lift ?? ''}`} banner={b} />
      ))}
    </>
  );
}

function BannerView(props: { banner: Banner }) {
  const app = useApp();
  const { program, today, input } = app;
  const b = props.banner;
  const dismiss = () => void app.log({ type: 'suggestionDismissed', date: today, suggestion: b.kind, ...(b.lift ? { lift: b.lift } : {}) });
  switch (b.kind) {
    case 'painCheck':
      return (
        <div class="note">
          <div>{b.message}</div>
          <div class="small">The session screen asks at your next session with it.</div>
          <div class="btn-row">
            <button
              type="button"
              class="chip"
              onClick={() =>
                b.lift && b.lift !== 'chin' && b.lift !== 'dip' && void app.log({ type: 'painCleared', date: today, lift: b.lift, how: 'clinician' })
              }
            >
              {program.safety.clinicianClearedButton}
            </button>
          </div>
        </div>
      );
    case 'lightWeek': {
      const reasons = triggers(input).find((s) => s.kind === 'lightWeek')?.reasons ?? [];
      const [thisWeek, nextWeek, notNow] = program.deload.lightWeekChoices;
      const declare = (scope: 'restOfWeek' | 'nextWeek') =>
        void app.log({ type: 'weekDeclaration', date: today, weekStart: weekStart(today), kind: 'light', scope });
      return (
        <div class="note">
          <div>{b.message}</div>
          {reasons.length > 0 && (
            <ul class="small" style={{ margin: '6px 0 0', paddingLeft: '18px' }}>
              {reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
          <div class="chips">
            <button type="button" class="chip" onClick={() => declare('restOfWeek')}>
              {thisWeek}
            </button>
            <button type="button" class="chip" onClick={() => declare('nextWeek')}>
              {nextWeek}
            </button>
            <button type="button" class="chip" onClick={dismiss}>
              {notNow}
            </button>
          </div>
        </div>
      );
    }
    case 'foodLever':
      return (
        <div class="note">
          <div>{b.message}</div>
          <YesNo
            label={b.message}
            value={null}
            onChange={(answer) =>
              b.lift && b.lift !== 'chin' && b.lift !== 'dip' && void app.log({ type: 'foodLeverAnswer', date: today, lift: b.lift, answer })
            }
          />
        </div>
      );
    case 'graduation':
    case 'earlyStall':
      return (
        <div class="note info">
          <div>{b.message}</div>
          <div class="btn-row">
            <button type="button" class="chip" onClick={dismiss}>
              Dismiss
            </button>
          </div>
        </div>
      );
    default:
      return <div class="note info">{b.message}</div>;
  }
}

/** "Back up your log" after Friday's session, if there's been no export in 7 days (SPEC.md section 8). */
function BackupReminder() {
  const { repo, today } = useApp();
  const [problem, setProblem] = useState<string | null>(null);
  const last = repo.meta().lastExportAt;
  if (!backupReminderDue(repo.events(), today, last ? localDate(new Date(last)) : null)) return null;
  return (
    <div class="note">
      <div>Back up your log. Save the file to Files or iCloud Drive.</div>
      {problem && <div class="small">{problem}</div>}
      <div class="btn-row">
        <button
          type="button"
          class="chip"
          onClick={() => {
            setProblem(null);
            exportBackup(repo, today).catch((e: unknown) => setProblem(`The backup didn't save${e instanceof Error ? ` (${e.message})` : ''}.`));
          }}
        >
          Export
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ week strip

function WeekStrip(props: { days: DayPlan[]; today: LocalDate }) {
  return (
    <div class="strip" role="list" aria-label="This week" style={{ gridTemplateColumns: `repeat(${props.days.length}, 1fr)` }}>
      {props.days.map((d) => {
        const what = d.kind === 'lifting' ? 'lifting' : d.kind === 'conditioning' ? 'conditioning' : d.kind === 'sick' ? 'sick' : 'off';
        const doneKind = d.loggedLifting.length > 0 ? 'lifting' : 'conditioning';
        const label =
          d.status === 'done'
            ? `${doneKind}, done`
            : d.status === 'missed' || d.status === 'skipped'
              ? `${what}, ${d.status}`
              : d.status === 'off'
                ? 'off'
                : `${what}, planned`;
        const mark =
          d.status === 'done' ? '✓' : d.status === 'off' ? '·' : d.kind === 'lifting' ? (d.workout ?? 'L') : d.kind === 'conditioning' ? 'C' : '·';
        const cls = ['strip-day', d.status === 'done' ? 'done' : '', d.status === 'missed' || d.status === 'skipped' ? 'missed' : '', d.date === props.today ? 'today' : '']
          .filter(Boolean)
          .join(' ');
        return (
          <div role="listitem" class={cls} key={d.date} aria-label={`${weekdayShort(d.date)}: ${label}`}>
            {weekdayShort(d.date)}
            <span class="mark" aria-hidden="true">
              {d.status === 'missed' || d.status === 'skipped' ? '–' : mark}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------ menus

function SomethingCameUp(props: { day: DayPlan; onClose: () => void }) {
  const app = useApp();
  const { program, today } = app;
  const [view, setView] = useState<'menu' | 'sick' | 'floor' | 'noTime'>('menu');
  const close = props.onClose;
  const { day } = props;
  const canSkip = day.status === 'planned' && (day.kind === 'lifting' || day.kind === 'conditioning');
  if (view === 'noTime' && canSkip) return <NoTimeToday kind={day.kind as 'lifting' | 'conditioning'} onClose={close} />;
  if (view === 'sick') {
    return (
      <Sheet title="Sick" onClose={close}>
        <p>{program.illness.question}</p>
        <YesNo
          label={program.illness.question}
          value={null}
          onChange={(symptoms) => {
            void app.log({ type: 'illness', date: today, kind: 'start', symptoms });
            close();
          }}
        />
      </Sheet>
    );
  }
  if (view === 'floor') {
    return (
      <Confirm
        title="Floor week"
        message="This calendar week becomes a floor week: two short lifting sessions on days that aren't back to back, no chins or dips, and no conditioning."
        confirm="Make it a floor week"
        onCancel={close}
        onConfirm={() => {
          void app.log({ type: 'weekDeclaration', date: today, weekStart: weekStart(today), kind: 'floor', scope: 'restOfWeek' });
          close();
        }}
      />
    );
  }
  return (
    <Sheet title="Something came up" onClose={close}>
      <div class="stack">
        {canSkip && (
          <button type="button" class="btn btn-ghost" onClick={() => setView('noTime')}>
            No time today
          </button>
        )}
        <button type="button" class="btn btn-ghost" onClick={() => setView('sick')}>
          I'm sick
        </button>
        <button
          type="button"
          class="btn btn-ghost"
          onClick={() => {
            void app.log({ type: 'weekDeclaration', date: today, weekStart: weekStart(today), kind: 'overload', scope: 'restOfWeek' });
            close();
          }}
        >
          Overloaded week
        </button>
        <button type="button" class="btn btn-ghost" onClick={() => setView('floor')}>
          Floor week
        </button>
        <button type="button" class="btn-quiet" onClick={close}>
          Cancel
        </button>
      </div>
    </Sheet>
  );
}

/**
 * "No time today" (RULES.md section 1, Q22). For lifting, it shows how the
 * rest of the week moves before he confirms.
 */
function NoTimeToday(props: { kind: 'lifting' | 'conditioning'; onClose: () => void }) {
  const app = useApp();
  const { today, input } = app;
  const after = useMemo(() => {
    if (props.kind !== 'lifting') return [];
    const probe: AnyEvent = { id: 'no-time-probe', type: 'skip', date: today, kind: 'lifting', reason: 'time', createdAt: '', updatedAt: '' };
    return weekSummary({ ...input, events: [...input.events, probe] }, weekStart(today)).days.filter(
      (d) => d.date > today && (d.kind === 'lifting' || d.kind === 'conditioning'),
    );
  }, [props.kind, today, input]);
  const skip = () => {
    void app.log({ type: 'skip', date: today, kind: props.kind, reason: 'time' });
    props.onClose();
  };
  return (
    <Sheet title="No time today?" onClose={props.onClose}>
      {props.kind === 'conditioning' ? (
        <p>Even 20 easy minutes counts as today's session. A skipped conditioning session isn't made up, and the rest of the week stays as it is.</p>
      ) : after.length > 0 ? (
        <>
          <p>Nothing is lost. Today's session moves to tomorrow, and the rest of the week moves a day with it:</p>
          <ul class="lines">
            {after.map((d) => (
              <li key={d.date}>
                {weekdayShort(d.date)}: {d.kind === 'lifting' ? `Workout ${d.workout ?? ''}`.trim() : 'Conditioning'}
              </li>
            ))}
          </ul>
          {after.some((d) => weekdayIndex(d.date) === 5 && d.kind === 'lifting') && (
            <p class="small muted">If Saturday doesn't work, tap "Move it to Sunday" that morning.</p>
          )}
        </>
      ) : (
        <p>The week ends today, so this session isn't made up. The next lifting session picks up where you left off.</p>
      )}
      <div class="btn-row">
        <button type="button" class="btn btn-ghost" onClick={props.onClose}>
          Cancel
        </button>
        <button type="button" class="btn btn-primary" onClick={skip}>
          {props.kind === 'lifting' && after.length > 0 ? 'Move it' : 'Skip it'}
        </button>
      </div>
    </Sheet>
  );
}

/** Past-date entries (RULES.md section 17, repo instruction 9): log a session for an earlier date. */
function PastEntry(props: { onClose: () => void; onStart: (kind: 'lifting' | 'conditioning', date: LocalDate) => void }) {
  const { program, today, repo } = useApp();
  const yesterday = addDays(today, -1);
  const first = program.athlete.startDate;
  const [date, setDate] = useState<LocalDate>(yesterday < first ? first : yesterday);
  const plan = useMemo(() => planFor(repo.input(today), date), [repo, today, date]);
  const [kind, setKind] = useState<'lifting' | 'conditioning' | null>(null);
  const chosen = kind ?? (plan.kind === 'conditioning' ? 'conditioning' : 'lifting');
  const later = repo.events().some((e) => (e.type === 'liftingSession' || e.type === 'conditioningSession') && e.date > date);
  const valid = date >= first && date < today;
  return (
    <Sheet title="Log a past session" onClose={props.onClose}>
      <div class="field">
        <label for="past-date">Date</label>
        <input id="past-date" type="date" min={first} max={yesterday} value={date} onInput={(e) => setDate(e.currentTarget.value)} />
      </div>
      {valid && <p class="small muted">{shortDate(date)}</p>}
      <Choice
        label="Kind of session"
        options={[
          { value: 'lifting', label: 'Lifting' },
          { value: 'conditioning', label: 'Conditioning' },
        ]}
        value={chosen}
        onChange={(v) => setKind(v as 'lifting' | 'conditioning')}
      />
      {later && valid && <p class="note info">Sessions logged after this date will be recalculated.</p>}
      <div class="btn-row">
        <button type="button" class="btn btn-ghost" onClick={props.onClose}>
          Cancel
        </button>
        <button type="button" class="btn btn-primary" disabled={!valid} onClick={() => props.onStart(chosen, date)}>
          Start entry
        </button>
      </div>
    </Sheet>
  );
}
