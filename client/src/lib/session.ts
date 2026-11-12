import { safeStorage } from './hooks.ts';

/** Sesión del jugador en localStorage: permite reconectar sin perder el saldo. */
export interface PlayerSession {
  code: string;
  token: string;
  nickname: string;
}
const KEY = 'cc:player';

export function getSession(): PlayerSession | null {
  try {
    const raw = safeStorage()?.getItem(KEY);
    return raw ? (JSON.parse(raw) as PlayerSession) : null;
  } catch {
    return null;
  }
}
export function saveSession(s: PlayerSession) {
  try {
    safeStorage()?.setItem(KEY, JSON.stringify(s));
  } catch {
    /* sin almacenamiento: la sesión vive solo en memoria */
  }
}
export function clearSession() {
  try {
    safeStorage()?.removeItem(KEY);
  } catch {
    /* nada */
  }
}

// Sesión del host (en sessionStorage, para re-autenticar al reconectar).
export function getHostSession(): { code: string; pin: string } | null {
  try {
    const raw = window.sessionStorage.getItem('cc:host');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
export function saveHostSession(s: { code: string; pin: string } | null) {
  try {
    if (s) window.sessionStorage.setItem('cc:host', JSON.stringify(s));
    else window.sessionStorage.removeItem('cc:host');
  } catch {
    /* nada */
  }
}
