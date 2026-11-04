// Small hand-drawn SVG charts for Progress (SPEC.md section 2: no chart
// library). One series per chart, so the card's title names it and there's
// no legend box. Tap anywhere on a chart for the nearest value; a hidden
// table carries the same numbers for VoiceOver.

import { useRef, useState } from 'preact/hooks';
import { dayNumber, type LocalDate } from '../engine';
import { lb, shortDate } from './format';

const W = 320;
const PAD = { left: 34, right: 44, top: 16, bottom: 20 };

export interface ChartPoint {
  date: LocalDate;
  value: number;
  /** On the line (heavy work) or a hollow marker beside it (light and floor weeks, light days, returns). */
  onLine: boolean;
  /** A reset happened at this session. */
  reset?: boolean;
  /** Shown in the readout after the value, such as "light week". */
  note?: string;
}

function niceStep(span: number): number {
  for (const s of [2.5, 5, 10, 20, 25, 50, 100]) if (span / s <= 4) return s;
  return 200;
}

function ticks(min: number, max: number): number[] {
  const step = niceStep(Math.max(max - min, 1));
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = lo; v <= hi + 1e-9; v += step) out.push(Math.round(v * 100) / 100);
  return out.length >= 2 ? out : [lo, lo + step];
}

function readout(p: ChartPoint, unit: string): string {
  return `${shortDate(p.date)} · ${lb(p.value)} ${unit}${p.note ? ` · ${p.note}` : ''}${p.reset ? ' · reset' : ''}`;
}

/** Weight (or load) over time. */
export function LineChart(props: { points: ChartPoint[]; unit: string; label: string; height?: number }) {
  const { points, unit } = props;
  const H = props.height ?? 130;
  const svg = useRef<SVGSVGElement>(null);
  const [active, setActive] = useState<number | null>(null);
  if (points.length === 0) return <p class="small muted">Nothing logged yet.</p>;

  const days = points.map((p) => dayNumber(p.date));
  const d0 = Math.min(...days);
  const d1 = Math.max(...days);
  const ys = ticks(Math.min(...points.map((p) => p.value)), Math.max(...points.map((p) => p.value)));
  const y0 = ys[0]!;
  const y1 = ys[ys.length - 1]!;
  const x = (d: number) => (d1 === d0 ? (PAD.left + W - PAD.right) / 2 : PAD.left + ((d - d0) / (d1 - d0)) * (W - PAD.left - PAD.right));
  const y = (v: number) => H - PAD.bottom - ((v - y0) / (y1 - y0)) * (H - PAD.top - PAD.bottom);
  const line = points.filter((p) => p.onLine);
  const path = line.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(dayNumber(p.date)).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const last = line[line.length - 1] ?? points[points.length - 1]!;

  const pick = (clientX: number) => {
    const r = svg.current?.getBoundingClientRect();
    if (!r || r.width === 0) return;
    const vx = ((clientX - r.left) / r.width) * W;
    let best = 0;
    points.forEach((p, i) => {
      if (Math.abs(x(dayNumber(p.date)) - vx) < Math.abs(x(dayNumber(points[best]!.date)) - vx)) best = i;
    });
    setActive(best);
  };
  const shown = active !== null ? points[active] : null;

  return (
    <div class="chart">
      <div class="chart-readout small" aria-hidden="true">
        {shown ? readout(shown, unit) : 'Tap the chart for a value.'}
      </div>
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${props.label}: ${points.length} entries, latest ${lb(last.value)} ${unit} on ${shortDate(last.date)}.`}
        onPointerDown={(e) => pick(e.clientX)}
        onPointerMove={(e) => e.buttons > 0 && pick(e.clientX)}
      >
        {ys.map((v) => (
          <g key={v}>
            <line class="grid" x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} />
            <text class="tick" x={PAD.left - 6} y={y(v) + 4} text-anchor="end">
              {lb(v)}
            </text>
          </g>
        ))}
        <text class="tick" x={PAD.left} y={H - 4}>
          {shortDate(points[0]!.date).replace(/^\w+, /, '')}
        </text>
        {d1 !== d0 && (
          <text class="tick" x={W - PAD.right} y={H - 4} text-anchor="end">
            {shortDate(points[points.length - 1]!.date).replace(/^\w+, /, '')}
          </text>
        )}
        {points
          .filter((p) => p.reset)
          .map((p) => (
            <g key={`r${p.date}`}>
              <line class="reset" x1={x(dayNumber(p.date))} x2={x(dayNumber(p.date))} y1={PAD.top - 4} y2={H - PAD.bottom} />
              <text class="tick" x={x(dayNumber(p.date)) + 3} y={PAD.top + 2}>
                Reset
              </text>
            </g>
          ))}
        {shown && <line class="crosshair" x1={x(dayNumber(shown.date))} x2={x(dayNumber(shown.date))} y1={PAD.top - 4} y2={H - PAD.bottom} />}
        {line.length > 1 && <path class="series" d={path} />}
        {points.map((p, i) => (
          <circle
            key={i}
            class={p.onLine ? 'dot' : 'dot hollow'}
            cx={x(dayNumber(p.date))}
            cy={y(p.value)}
            r={i === active ? 5.5 : 4}
          />
        ))}
        <text class="end-label" x={x(dayNumber(last.date)) + 8} y={y(last.value) + 4}>
          {lb(last.value)}
        </text>
      </svg>
      <table class="sr-only">
        <caption>{props.label}</caption>
        <tbody>
          {points.map((p, i) => (
            <tr key={i}>
              <td>{shortDate(p.date)}</td>
              <td>
                {lb(p.value)} {unit}
                {p.note ? `, ${p.note}` : ''}
                {p.reset ? ', reset' : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Conditioning minutes per calendar week against the 150-minute guideline. */
export function WeekBars(props: { weeks: { weekStart: LocalDate; minutes: number }[]; target: number; label: string }) {
  const { weeks, target } = props;
  const H = 130;
  const svg = useRef<SVGSVGElement>(null);
  const [active, setActive] = useState<number | null>(null);
  if (weeks.length === 0) return <p class="small muted">Nothing logged yet.</p>;
  const ys = ticks(0, Math.max(target, ...weeks.map((w) => w.minutes)));
  const top = ys[ys.length - 1]!;
  const slot = (W - PAD.left - PAD.right) / weeks.length;
  const bw = Math.min(24, slot - 2);
  const y = (v: number) => H - PAD.bottom - (v / top) * (H - PAD.top - PAD.bottom);
  const base = y(0);
  const bar = (i: number, v: number) => {
    const x0 = PAD.left + i * slot + (slot - bw) / 2;
    const h = base - y(v);
    if (h <= 0) return '';
    const r = Math.min(4, h, bw / 2);
    // Rounded at the data end, square at the baseline.
    return `M${x0},${base} V${base - h + r} Q${x0},${base - h} ${x0 + r},${base - h} H${x0 + bw - r} Q${x0 + bw},${base - h} ${x0 + bw},${base - h + r} V${base} Z`;
  };
  const pick = (clientX: number) => {
    const r = svg.current?.getBoundingClientRect();
    if (!r || r.width === 0) return;
    const vx = ((clientX - r.left) / r.width) * W;
    setActive(Math.max(0, Math.min(weeks.length - 1, Math.floor((vx - PAD.left) / slot))));
  };
  const shown = active !== null ? weeks[active] : null;
  return (
    <div class="chart">
      <div class="chart-readout small" aria-hidden="true">
        {shown ? `Week of ${shortDate(shown.weekStart)} · ${shown.minutes} of ${target} min` : 'Tap a week for its minutes.'}
      </div>
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${props.label}: ${weeks.length} weeks, this week ${weeks[weeks.length - 1]!.minutes} of ${target} minutes.`}
        onPointerDown={(e) => pick(e.clientX)}
        onPointerMove={(e) => e.buttons > 0 && pick(e.clientX)}
      >
        {ys.map((v) => (
          <g key={v}>
            <line class="grid" x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} />
            <text class="tick" x={PAD.left - 6} y={y(v) + 4} text-anchor="end">
              {v}
            </text>
          </g>
        ))}
        {weeks.map((w, i) => (
          <path key={w.weekStart} class={i === active ? 'bar active' : 'bar'} d={bar(i, w.minutes)} />
        ))}
        <line class="target" x1={PAD.left} x2={W - PAD.right} y1={y(target)} y2={y(target)} />
        <text class="end-label" x={W - PAD.right + 4} y={y(target) + 4}>
          {target}
        </text>
        <text class="tick" x={PAD.left} y={H - 4}>
          {shortDate(weeks[0]!.weekStart).replace(/^\w+, /, '')}
        </text>
        <text class="tick" x={W - PAD.right} y={H - 4} text-anchor="end">
          This week
        </text>
      </svg>
      <table class="sr-only">
        <caption>{props.label}</caption>
        <tbody>
          {weeks.map((w) => (
            <tr key={w.weekStart}>
              <td>Week of {shortDate(w.weekStart)}</td>
              <td>{w.minutes} minutes</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
