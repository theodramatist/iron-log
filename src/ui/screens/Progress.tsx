// Progress (SPEC.md section 5.6): work weight per barbell lift, effective load
// for chins and dips, bodyweight, and conditioning minutes per week.

import { useMemo, useState } from 'preact/hooks';
import {
  addDays,
  bodyweightHistory,
  effectiveSettings,
  liftStates,
  weekStart,
  type AnyEvent,
  type AssistLiftId,
  type BarbellLiftId,
  type LiftHistoryEntry,
  type LocalDate,
} from '../../engine';
import { LineChart, WeekBars, type ChartPoint } from '../charts';
import { lb, shortDate } from '../format';
import { useApp } from '../store';
import { nextWaistCheck, nextWeighIn, waistHistory } from '../bodyCheck';
import { WaistSheet } from '../BodyCheck';
import { WeighInSheet } from './Settings';

const NOT_ON_LINE: Partial<Record<LiftHistoryEntry['kind'], string>> = {
  lightWeek: 'light week',
  floor: 'floor week',
  lightDay: 'light day',
  painReturn: 'return',
};

/** Sessions he lifted: heavy work on the line, lighter sessions as hollow markers beside it. */
function liftPoints(history: LiftHistoryEntry[]): ChartPoint[] {
  return history
    .filter((h) => h.result === 'made' || h.result === 'missed')
    .map((h) => {
      const note = NOT_ON_LINE[h.kind];
      return { date: h.date, value: h.weight, onLine: !note, reset: h.reset, note: note ?? (h.result === 'missed' ? 'missed' : undefined) };
    });
}

/** Chin and dip effective load: the latest weigh-in, minus assistance or plus the belt. */
function assistPoints(events: readonly AnyEvent[], weights: { date: LocalDate; lb: number }[], lift: AssistLiftId): ChartPoint[] {
  const out: ChartPoint[] = [];
  for (const e of events) {
    if (e.type !== 'liftingSession' || e.stopped) continue;
    const log = e.assist?.[lift];
    if (!log || !log.reps.some((r) => r > 0)) continue;
    // Before the first weigh-in (setup's comes after Monday's session), use the earliest one.
    const bw = [...weights].reverse().find((w) => w.date <= e.date) ?? weights[0];
    if (!bw) continue;
    const assistance = log.calibration?.setting ?? log.assistance;
    out.push({
      date: e.date,
      value: bw.lb - assistance + log.addedLoad,
      onLine: log.kind === 'heavy',
      ...(log.kind === 'lightWeek' ? { note: 'light week' } : {}),
    });
  }
  return out;
}

function weeklyMinutes(events: readonly AnyEvent[], from: LocalDate, through: LocalDate): { weekStart: LocalDate; minutes: number }[] {
  const byWeek = new Map<LocalDate, number>();
  for (let ws = from; ws <= through; ws = addDays(ws, 7)) byWeek.set(ws, 0);
  for (const e of events) {
    if ((e.type !== 'conditioningSession' && e.type !== 'liftingSession') || e.stopped) continue;
    const ws = weekStart(e.date);
    if (!byWeek.has(ws)) continue;
    const minutes = e.type === 'conditioningSession' ? e.actualMinutes : (e.spinMinutes ?? 0);
    byWeek.set(ws, byWeek.get(ws)! + minutes);
  }
  return [...byWeek].map(([weekStart, minutes]) => ({ weekStart, minutes }));
}

/** "41.5 in on Nov 16 · down 0.5 since Nov 2 · next check Nov 30" (Q28, Q29). */
function trendLine(points: { date: LocalDate; value: number }[], unit: string, next: LocalDate, today: LocalDate): string {
  const latest = points.at(-1)!;
  const first = points[0]!;
  const change = Math.round((latest.value - first.value) * 100) / 100;
  const since =
    points.length < 2 ? '' : change === 0 ? ` · same as ${shortDate(first.date)}` : ` · ${change < 0 ? 'down' : 'up'} ${lb(Math.abs(change))} since ${shortDate(first.date)}`;
  return `${lb(latest.value)} ${unit} on ${shortDate(latest.date)}${since} · next check ${next <= today ? 'due now' : shortDate(next)}`;
}

/** One point a day, the one logged last: setup's weight and a weigh-in the same day don't draw a stub. */
function lastPerDay<T extends { date: LocalDate }>(points: readonly T[]): T[] {
  const byDate = new Map<LocalDate, T>();
  for (const p of points) byDate.set(p.date, p);
  return [...byDate.values()];
}

export function Progress() {
  const { input, today, program, repo } = useApp();
  const [weigh, setWeigh] = useState(false);
  const [measure, setMeasure] = useState(false);
  const states = useMemo(() => liftStates(input), [input]);
  const settings = useMemo(() => effectiveSettings(input), [input]);
  const weights = useMemo(() => bodyweightHistory(input), [input]);
  const events = repo.events();
  const lifts: BarbellLiftId[] = ['squat', 'press', 'bench', 'deadlift', settings.pullChoice];
  const thisWeek = weekStart(today);
  const firstWeek = weekStart(program.athlete.startDate);
  const from = addDays(thisWeek, -7 * 11) < firstWeek ? firstWeek : addDays(thisWeek, -7 * 11);
  const weeks = useMemo(() => weeklyMinutes(events, from, thisWeek), [events, from, thisWeek]);
  const waists = useMemo(() => waistHistory(events).map((w) => ({ date: w.date, value: w.inches })), [events]);
  const daily = useMemo(() => lastPerDay(weights).map((w) => ({ date: w.date, value: w.lb })), [weights]);

  return (
    <main class="screen">
      <h1>Progress</h1>
      <p class="small muted">
        <span class="key-dot" aria-hidden="true" /> heavy sessions, on the line · <span class="key-dot hollow" aria-hidden="true" /> light and
        floor weeks, light days, and returns
      </p>

      {lifts.map((lift) => {
        const s = states[lift];
        const points = liftPoints(s.history);
        return (
          <section class="card" key={lift} aria-label={s.label}>
            <div class="spread">
              <div class="card-title">{s.label}</div>
              {s.lcw !== null && <span class="num small muted">base {lb(s.lcw)}</span>}
            </div>
            <LineChart points={points} unit="lb" label={`${s.label} work weight`} />
          </section>
        );
      })}

      {(['chin', 'dip'] as const).map((lift) => (
        <section class="card" key={lift} aria-label={program.lifts[lift].label}>
          <div class="card-title">{program.lifts[lift].label}</div>
          <p class="small muted">Effective load: bodyweight minus the help, or plus the belt.</p>
          <LineChart points={assistPoints(events, weights, lift)} unit="lb" label={`${program.lifts[lift].label} effective load`} />
        </section>
      ))}

      <section class="card" aria-label="Bodyweight">
        <div class="spread">
          <div class="card-title">Bodyweight</div>
          <button type="button" class="chip" onClick={() => setWeigh(true)}>
            Add weigh-in
          </button>
        </div>
        {daily.length > 0 && <p class="small muted num">{trendLine(daily, 'lb', nextWeighIn(input), today)}</p>}
        <LineChart points={daily.map((w) => ({ ...w, onLine: true }))} unit="lb" label="Bodyweight" />
      </section>

      <section class="card" aria-label="Waist">
        <div class="spread">
          <div class="card-title">Waist</div>
          <button type="button" class="chip" onClick={() => setMeasure(true)}>
            Add measurement
          </button>
        </div>
        <p class="small muted num">
          {waists.length > 0
            ? trendLine(waists, 'in', nextWaistCheck(events, today), today)
            : 'Every two weeks with the tape. The first check comes at the end of your next lifting session, with a weigh-in.'}
        </p>
        {waists.length > 0 && <LineChart points={waists.map((w) => ({ ...w, onLine: true }))} unit="in" label="Waist" />}
      </section>

      <section class="card" aria-label="Conditioning minutes per week">
        <div class="card-title">Conditioning minutes per week</div>
        <p class="small muted">Sessions and after-lifting spins, against the 150-minute guideline.</p>
        <WeekBars weeks={weeks} target={program.conditioning.weeklyTargetMinutes} label="Conditioning minutes per week" />
      </section>

      {weigh && <WeighInSheet onClose={() => setWeigh(false)} />}
      {measure && <WaistSheet onClose={() => setMeasure(false)} />}
    </main>
  );
}
