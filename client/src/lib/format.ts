import type { PhaseColor, QuestionType } from '../../../shared/types.ts';

const nf = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 });

export const fmt = (n: number) => nf.format(n);

export function fmtSigned(n: number) {
  if (n > 0) return `+${fmt(n)}`;
  if (n < 0) return `−${fmt(Math.abs(n))}`;
  return '0';
}

/** Valor con su unidad: "$1.182", "32%", "57,2 veces". */
export function fmtUnit(n: number, unit: string | null | undefined) {
  if (unit === 'COP') return `$${fmt(n)}`;
  if (unit === '%') return `${fmt(n)}%`;
  return unit ? `${fmt(n)} ${unit}` : fmt(n);
}

export function fmtMultiplier(m: number) {
  return `x${fmt(m)}`;
}

export const TYPE_META: Record<QuestionType, { icon: string; label: string; help: string }> = {
  mito_realidad: { icon: '⚖️', label: 'Mito o Realidad', help: '¿Es mito o es realidad?' },
  intruso: { icon: '🕵️', label: 'El Intruso', help: 'Encuentra la opción que no encaja' },
  ranking: { icon: '🏆', label: 'Ranking', help: 'Ordena los ítems' },
  numeric: { icon: '🎯', label: 'El Dato Correcto', help: 'Acércate lo más posible al dato real' },
};

export const PHASE_COLORS: Record<PhaseColor, { hex: string; text: string; name: string }> = {
  green: { hex: '#3DDC84', text: '#04301A', name: 'verde' },
  purple: { hex: '#B983FF', text: '#2A0A55', name: 'morado' },
  orange: { hex: '#FF9F43', text: '#3D1C00', name: 'naranja' },
  blue: { hex: '#5AB0FF', text: '#06243F', name: 'azul' },
  gold: { hex: '#FFD23F', text: '#3B2B00', name: 'dorado' },
};

export const STATE_LABEL: Record<string, string> = {
  lobby: 'Lobby',
  phase_intro: 'Intro de capítulo',
  ready: 'Pregunta lista',
  open: 'Apuestas abiertas',
  locked: 'Apuestas cerradas',
  revealed: 'Respuesta revelada',
  leaderboard: 'Ranking',
  phase_end: 'Fin de fase',
  finished: 'Juego terminado',
};

export function answerLabel(value: unknown, unit?: string | null): string {
  if (Array.isArray(value)) return value.map((v, i) => `${i + 1}. ${v}`).join('  ');
  if (typeof value === 'number') return fmtUnit(value, unit);
  if (value === 'MITO') return 'Mito';
  if (value === 'REALIDAD') return 'Realidad';
  return String(value ?? '—');
}
