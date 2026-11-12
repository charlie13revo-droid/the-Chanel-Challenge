// Efectos de sonido sintetizados con Web Audio (sin archivos externos).
import { safeStorage } from './hooks.ts';

let ctx: AudioContext | null = null;
let muted = safeStorage()?.getItem('cc:muted') === '1';

export const isMuted = () => muted;
export function setMuted(m: boolean) {
  muted = m;
  safeStorage()?.setItem('cc:muted', m ? '1' : '0');
}

function ac(): AudioContext | null {
  if (muted) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.18) {
  const c = ac();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  const t = c.currentTime + start;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}

export const sfx = {
  tick: () => tone(880, 0, 0.08, 'square', 0.06),
  open: () => [523, 659, 784].forEach((f, i) => tone(f, i * 0.09, 0.25, 'triangle')),
  lock: () => [392, 262].forEach((f, i) => tone(f, i * 0.12, 0.3, 'sawtooth', 0.08)),
  reveal: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.11, 0.45, 'triangle')),
  whoosh: () => tone(330, 0, 0.35, 'sine', 0.1),
  fanfare: () =>
    [523, 523, 523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.14, 0.35, 'triangle', 0.16)),
};
