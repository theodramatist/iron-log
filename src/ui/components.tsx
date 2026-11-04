// Small shared pieces: the plate bar, yes/no chips, steppers, sheets, and the flash.

import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { onFlash } from './alerts';
import { lb, platesText } from './format';

// The original Iron Log's plate colors. Plate numerals are decoration; the
// label beside the bar carries the same information.
const PLATE_COLOR: Record<string, string> = {
  '45': '#3f7fd1',
  '35': '#e0a53c',
  '25': '#3fb370',
  '10': '#cdd6e2',
  '5': '#8a97a8',
  '2.5': '#b62d2d',
  '1.25': '#7c8aa0',
  '1': '#9aa6b6',
  '0.75': '#b3bdca',
  '0.5': '#c2cbd7',
  '0.25': '#d5dce5',
};

export function PlateBar(props: { weight: number; plates: readonly number[] }) {
  const { weight, plates } = props;
  return (
    <div class="bar" role="img" aria-label={`${lb(weight)} pounds. ${platesText(plates)}.`}>
      <div class="collar" />
      {plates.map((p, i) => (
        <div
          key={i}
          aria-hidden="true"
          class={p === 2.5 ? 'plate light-text' : 'plate'}
          style={{
            height: `${Math.round(18 + (Math.min(p, 45) / 45) * 26)}px`,
            width: `${Math.round(8 + p / 3)}px`,
            background: PLATE_COLOR[String(p)] ?? '#8a97a8',
          }}
        >
          {p >= 25 ? lb(p) : ''}
        </div>
      ))}
      <div class="bar-label" aria-hidden="true">
        <b>{lb(weight)}</b> lb
        <br />
        {platesText(plates)}
      </div>
    </div>
  );
}

export function YesNo(props: {
  label: string;
  value: boolean | null | undefined;
  onChange: (v: boolean) => void;
  yes?: string;
  no?: string;
}) {
  return (
    <div class="chips tight" role="group" aria-label={props.label}>
      <button type="button" class="chip" aria-pressed={props.value === true} onClick={() => props.onChange(true)}>
        {props.yes ?? 'Yes'}
      </button>
      <button type="button" class="chip" aria-pressed={props.value === false} onClick={() => props.onChange(false)}>
        {props.no ?? 'No'}
      </button>
    </div>
  );
}

export function Question(props: { text: string; children: ComponentChildren }) {
  return (
    <div class="question">
      <div class="question-text">{props.text}</div>
      {props.children}
    </div>
  );
}

export function Choice<T extends string | number>(props: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T | null | undefined;
  onChange: (v: T) => void;
  tight?: boolean;
}) {
  return (
    <div class={props.tight ? 'chips tight' : 'chips'} role="group" aria-label={props.label}>
      {props.options.map((o) => (
        <button key={String(o.value)} type="button" class="chip" aria-pressed={props.value === o.value} onClick={() => props.onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Stepper(props: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  format?: (v: number) => string;
}) {
  const step = props.step ?? 1;
  const min = props.min ?? -Infinity;
  const max = props.max ?? Infinity;
  const fmt = props.format ?? String;
  return (
    <div class="stepper" role="group" aria-label={props.label}>
      <button type="button" aria-label={`Less ${props.label.toLowerCase()}`} disabled={props.value - step < min} onClick={() => props.onChange(Math.max(min, props.value - step))}>
        −
      </button>
      <span class="val" aria-live="polite">
        {fmt(props.value)}
      </span>
      <button type="button" aria-label={`More ${props.label.toLowerCase()}`} disabled={props.value + step > max} onClick={() => props.onChange(Math.min(max, props.value + step))}>
        +
      </button>
    </div>
  );
}

/**
 * A bottom sheet for menus and confirmations. Focus moves in once, when it
 * opens, and goes back where it was when it closes. Callers pass a new
 * onClose on every render, so it's read through a ref.
 */
export function Sheet(props: { title: string; onClose: () => void; children: ComponentChildren }) {
  const panel = useRef<HTMLDivElement>(null);
  const onClose = useRef(props.onClose);
  onClose.current = props.onClose;
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose.current();
    document.addEventListener('keydown', onKey);
    panel.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      if (opener?.isConnected) opener.focus();
    };
  }, []);
  return (
    <div class="backdrop" onClick={(e) => e.target === e.currentTarget && props.onClose()}>
      <div class="sheet" role="dialog" aria-modal="true" aria-label={props.title} tabIndex={-1} ref={panel}>
        <h3>{props.title}</h3>
        {props.children}
      </div>
    </div>
  );
}

export function Confirm(props: {
  title: string;
  message?: string;
  confirm: string;
  cancel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Sheet title={props.title} onClose={props.onCancel}>
      {props.message && <p>{props.message}</p>}
      <div class="btn-row">
        <button type="button" class="btn btn-ghost" onClick={props.onCancel}>
          {props.cancel ?? 'Cancel'}
        </button>
        <button type="button" class="btn btn-primary" onClick={props.onConfirm}>
          {props.confirm}
        </button>
      </div>
    </Sheet>
  );
}

/** The screen flash that goes with every alert. */
export function FlashHost() {
  const [n, setN] = useState(0);
  useEffect(() => onFlash(() => setN((x) => x + 1)), []);
  useEffect(() => {
    if (n === 0) return;
    const t = window.setTimeout(() => setN(0), 1600);
    return () => window.clearTimeout(t);
  }, [n]);
  return n > 0 ? <div key={n} class="flash" aria-hidden="true" /> : null;
}

/** Long press: fires after 550 ms of holding. A normal tap does the tap action. */
export function useLongPress(onLong: () => void, onTap: () => void) {
  const timer = useRef<number | null>(null);
  const fired = useRef(false);
  const clear = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  return {
    onPointerDown: () => {
      fired.current = false;
      clear();
      timer.current = window.setTimeout(() => {
        fired.current = true;
        onLong();
      }, 550);
    },
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
    onContextMenu: (e: Event) => e.preventDefault(),
    onClick: () => {
      if (fired.current) {
        fired.current = false;
        return;
      }
      onTap();
    },
  };
}
