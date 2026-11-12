// Reglas de puntaje (sección 4). Funciones puras: solo se ejecutan en el servidor.
import { NUMERIC_BONUS, QuestionType, minBet } from '../shared/types.ts';

export interface ScoreInput {
  type: QuestionType;
  answer: unknown; // respuesta correcta
  value: unknown; // respuesta del jugador (null = no respondió)
  bet: number;
  balance: number; // saldo antes de la pregunta
  multiplier: number;
}

export interface ScoreOutput {
  delta: number;
  isCorrect: boolean;
  /** Solo numéricas: error relativo |respuesta − real| / real */
  error?: number;
}

export function relativeError(value: number, real: number): number {
  if (real === 0) return Math.abs(value);
  return Math.abs(value - real) / Math.abs(real);
}

export function rankingHits(value: string[], answer: string[]): number {
  let hits = 0;
  for (let i = 0; i < answer.length; i++) if (value[i] === answer[i]) hits++;
  return hits;
}

export function score(input: ScoreInput): ScoreOutput {
  const { type, answer, value, multiplier } = input;

  // Sin respuesta: pierde la apuesta mínima (10% del saldo).
  if (value === null || value === undefined) {
    return { delta: -minBet(input.balance), isCorrect: false };
  }

  const bet = input.bet;
  const G = bet * multiplier;
  const win = (factor: number) => Math.round(G * factor);

  switch (type) {
    case 'mito_realidad':
    case 'intruso': {
      const ok = value === answer;
      return { delta: ok ? win(1) : -bet, isCorrect: ok };
    }
    case 'ranking': {
      const ans = answer as string[];
      const hits = rankingHits(value as string[], ans);
      if (hits === ans.length) return { delta: win(1.5), isCorrect: true };
      if (hits >= 2) return { delta: 0, isCorrect: false }; // recupera la apuesta
      return { delta: -bet, isCorrect: false };
    }
    case 'numeric': {
      const err = relativeError(Number(value), Number(answer));
      if (err <= 0.05 + 1e-9) return { delta: win(2), isCorrect: true, error: err };
      if (err <= 0.15 + 1e-9) return { delta: win(1), isCorrect: true, error: err };
      if (err <= 0.3 + 1e-9) return { delta: 0, isCorrect: false, error: err };
      return { delta: -bet, isCorrect: false, error: err };
    }
  }
}

/**
 * Bono +100 al más cercano de la sala (pregunta numérica).
 * Si hay empate en el error, gana el que respondió más rápido.
 */
export function closestWinner<T extends { error: number; responseMs: number }>(rows: T[]): T | null {
  let best: T | null = null;
  for (const r of rows) {
    if (
      !best ||
      r.error < best.error - 1e-12 ||
      (Math.abs(r.error - best.error) <= 1e-12 && r.responseMs < best.responseMs)
    ) {
      best = r;
    }
  }
  return best;
}

export { NUMERIC_BONUS };
