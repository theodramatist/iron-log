// What both session screens share: the top bar, Stop session, the session
// menu, save problems, and what a session screen does while it's open.

import { useEffect } from 'preact/hooks';
import type { EquipmentDown, LocalDate } from '../../../engine';
import { unlockAudio, useWakeLock } from '../../alerts';
import { Confirm, Sheet } from '../../components';
import { clock, shortDate } from '../../format';
import { useApp } from '../../store';

/**
 * While a session screen is open: keep the screen awake, hold the page behind
 * it still, and let any tap unlock sound. A session reopened after iOS closed
 * the app never saw the Start session tap that unlocks it (SPEC.md section 7).
 */
export function useSessionScreen(awake: boolean): void {
  useWakeLock(awake);
  useEffect(() => {
    const body = document.body.style;
    const overflow = body.overflow;
    body.overflow = 'hidden';
    document.addEventListener('pointerdown', unlockAudio, true);
    return () => {
      body.overflow = overflow;
      document.removeEventListener('pointerdown', unlockAudio, true);
    };
  }, []);
}

export function SessionTop(props: {
  past: boolean;
  date: LocalDate;
  elapsedSec: number;
  sub: string;
  actions: boolean;
  onMenu: () => void;
  onStop: () => void;
}) {
  return (
    <div class="session-top">
      <div class="clock">
        {props.past ? (
          <>
            <div class="num">Past entry</div>
            <div class="sub">{shortDate(props.date)}</div>
          </>
        ) : (
          <>
            <div class="num" role="timer" aria-label="Session time">
              {clock(props.elapsedSec)}
            </div>
            <div class="sub">{props.sub}</div>
          </>
        )}
      </div>
      {props.actions && (
        <button type="button" class="menu-btn" aria-label="Session menu" onClick={props.onMenu}>
          ⋯
        </button>
      )}
      {props.actions && (
        <button type="button" class="stop-btn" onClick={props.onStop}>
          Stop session
        </button>
      )}
    </div>
  );
}

export function StopSheet(props: { onKeepGoing: () => void; onEnd: () => void }) {
  const { program } = useApp();
  return (
    <Sheet title="Stop session" onClose={props.onKeepGoing}>
      <p class="note alarm">{program.safety.stopSessionMessage}</p>
      <p>Ending here logs the session as stopped. Nothing from it counts.</p>
      <div class="btn-row">
        <button type="button" class="btn btn-ghost" onClick={props.onKeepGoing}>
          Keep going
        </button>
        <button type="button" class="btn btn-primary" onClick={props.onEnd}>
          End session
        </button>
      </div>
    </Sheet>
  );
}

const EQUIPMENT: Record<EquipmentDown, string> = {
  assistMachine: 'Assist machine down',
  skiErg: 'SkiErg unavailable',
  airBike: 'Air bike unavailable',
};

/** Equipment down (RULES.md sections 2 and 8), and Discard. */
export function SessionMenu(props: {
  options: EquipmentDown[];
  down: EquipmentDown[];
  onChange: (down: EquipmentDown[]) => void;
  onClose: () => void;
  onDiscard: () => void;
}) {
  return (
    <Sheet title="Session" onClose={props.onClose}>
      <div class="card-kicker">Equipment down</div>
      <div class="chips">
        {props.options.map((id) => {
          const on = props.down.includes(id);
          return (
            <button
              type="button"
              class="chip"
              key={id}
              aria-pressed={on}
              onClick={() => props.onChange(on ? props.down.filter((x) => x !== id) : [...props.down, id])}
            >
              {EQUIPMENT[id]}
            </button>
          );
        })}
      </div>
      <div class="btn-row" style={{ marginTop: '18px' }}>
        <button type="button" class="btn btn-ghost" onClick={props.onDiscard}>
          Discard session
        </button>
        <button type="button" class="btn btn-primary" onClick={props.onClose}>
          Done
        </button>
      </div>
    </Sheet>
  );
}

export function DiscardConfirm(props: { onCancel: () => void; onConfirm: () => void }) {
  return (
    <Confirm title="Discard this session?" message="Nothing from it is logged." confirm="Discard" onCancel={props.onCancel} onConfirm={props.onConfirm} />
  );
}

/** A failed write is never silent. */
export function Problem(props: { message: string | null }) {
  return props.message ? (
    <p class="note alarm" role="alert">
      {props.message}
    </p>
  ) : null;
}

export const DRAFT_NOT_SAVED = "This phone isn't saving your progress right now. Keep going, and save the session at the end.";

export function saveFailed(e: unknown): string {
  const why = e instanceof Error && e.message ? ` (${e.message})` : '';
  return `This phone didn't save the session${why}. It's still here, so try again.`;
}

/** A session left unfinished on an earlier day reopens as a past entry. */
export function EarlierDayNote(props: { date: LocalDate }) {
  return (
    <p class="note info">
      This session from {shortDate(props.date)} wasn't finished. Finish it to log it for that day, or discard it from the ⋯ menu.
    </p>
  );
}
