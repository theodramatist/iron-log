// Alerts and the screen wake lock (SPEC.md section 7). iOS starts Web Audio
// only from a user gesture, so unlockAudio() runs on the Start session tap.
// The silent switch can mute the tone, so every alert also flashes the screen.

import { useEffect } from 'preact/hooks';

let audio: AudioContext | null = null;

export function unlockAudio(): void {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    audio ??= new Ctor();
    if (audio.state === 'suspended') void audio.resume();
    // A silent blip finishes the unlock on iOS.
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    gain.gain.value = 0;
    osc.connect(gain).connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + 0.01);
  } catch {
    // No sound. The flash still shows.
  }
}

function tone(times: number): void {
  if (!audio) return;
  try {
    if (audio.state === 'suspended') void audio.resume();
    const t0 = audio.currentTime + 0.02;
    for (let i = 0; i < times; i++) {
      const t = t0 + i * 0.3;
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
      osc.connect(gain).connect(audio.destination);
      osc.start(t);
      osc.stop(t + 0.26);
    }
  } catch {
    // The flash still shows.
  }
}

const FLASH = 'ironlog-flash';

/** A tone and a screen flash: rest over, or the next conditioning segment. */
export function alertNow(times = 2): void {
  tone(times);
  window.dispatchEvent(new Event(FLASH));
}

export function onFlash(fn: () => void): () => void {
  window.addEventListener(FLASH, fn);
  return () => window.removeEventListener(FLASH, fn);
}

/** Keep the screen awake while a session screen is open, and ask again on return to the foreground. */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let done = false;
    const request = async () => {
      if (document.visibilityState !== 'visible' || (lock && !lock.released)) return;
      try {
        const next = await navigator.wakeLock.request('screen');
        if (done) void next.release();
        else lock = next;
      } catch {
        // Not allowed here, or not supported: fail quietly.
      }
    };
    const onVisible = () => void request();
    void request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      done = true;
      document.removeEventListener('visibilitychange', onVisible);
      if (lock && !lock.released) void lock.release().catch(() => undefined);
    };
  }, [active]);
}
