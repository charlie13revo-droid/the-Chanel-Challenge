import { useEffect, useRef, useState } from 'react';

let clockOffset = 0;
/** Sincroniza el reloj local con el del servidor (se llama con cada estado recibido). */
export function syncClock(serverNow: number) {
  clockOffset = serverNow - Date.now();
}
export const serverNow = () => Date.now() + clockOffset;

/** Segundos restantes hasta `closesAt` (hora del servidor). */
export function useCountdown(closesAt: number | null | undefined, active: boolean) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!closesAt || !active) {
      setLeft(0);
      return;
    }
    const tick = () => setLeft(Math.max(0, (closesAt - serverNow()) / 1000));
    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [closesAt, active]);
  return left;
}

/** Animación de conteo numérico (0 → valor). */
export function useCountUp(target: number, durationMs = 1400, start = true) {
  const [v, setV] = useState(start ? 0 : target);
  const raf = useRef(0);
  useEffect(() => {
    if (!start) return;
    const t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      setV(target * eased);
      if (p < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [target, durationMs, start]);
  return v;
}

/** Retrasa un booleano (para disparar animaciones después del primer render). */
export function useDelayed(ms: number, key?: unknown) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    setOn(false);
    const id = setTimeout(() => setOn(true), ms);
    return () => clearTimeout(id);
  }, [ms, key]);
  return on;
}

export function safeStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
