// Tipos compartidos entre servidor y cliente.

export type QuestionType = 'mito_realidad' | 'intruso' | 'ranking' | 'numeric';

export type QuestionState =
  | 'lobby'
  | 'phase_intro'
  | 'ready'
  | 'open'
  | 'locked'
  | 'revealed'
  | 'leaderboard'
  | 'phase_end'
  | 'finished';

export type PhaseColor = 'green' | 'purple' | 'orange' | 'blue' | 'gold';

export interface PhaseMeta {
  id: number;
  title: string;
  multiplier: number;
  color: PhaseColor;
  channels: string[];
  drivers: string;
  phrase: string;
  questionCount: number;
}

/** Pregunta tal como la ve el público (sin respuesta). */
export interface PublicQuestion {
  id: number;
  phase: number;
  order: number;
  type: QuestionType;
  prompt: string;
  /** Opciones (intruso) o ítems a ordenar (ranking, en el orden de presentación). */
  options: string[];
  unit: string | null;
  min: number | null;
  max: number | null;
  step: number | null;
  timeLimit: number;
  multiplier: number;
}

/** Pregunta completa (host / admin). */
export interface FullQuestion extends PublicQuestion {
  /** mito: "MITO"|"REALIDAD"; intruso: opción; ranking: string[]; numeric: number */
  answer: string | number | string[];
  reveal: string;
  hostNote: string;
  multiplierOverride: number | null;
}

export interface DistributionBar {
  label: string;
  count: number;
  pct: number;
  correct: boolean;
}

export interface RevealData {
  questionId: number;
  type: QuestionType;
  correctAnswer: string | number | string[];
  reveal: string;
  source: string;
  respondents: number;
  correctPct: number;
  /** mito / intruso: barras por opción. numeric: histograma. ranking: % que ubicó bien cada ítem. */
  bars: DistributionBar[];
  /** numeric */
  roomAverage?: number;
  roomMedian?: number;
  closest?: { nickname: string; value: number } | null;
  /** ranking: orden promedio de la sala */
  roomOrder?: string[];
}

export interface LeaderEntry {
  playerId: string;
  nickname: string;
  team: string | null;
  balance: number;
  rank: number;
  prevRank: number | null;
}

export interface PhaseEndData {
  phaseId: number;
  podium: { nickname: string; team: string | null; gained: number }[];
  worstQuestion: { prompt: string; correctPct: number } | null;
  averageCorrectPct: number;
}

export interface FinalData {
  podium: LeaderEntry[];
  top: LeaderEntry[];
}

export interface PublicState {
  code: string;
  state: QuestionState;
  phase: PhaseMeta | null;
  phases: PhaseMeta[];
  questionIndex: number;
  question: PublicQuestion | null;
  /** En estado "ready": tipo de la próxima pregunta (el enunciado se oculta hasta abrirla). */
  teaserType: QuestionType | null;
  openedAt: number | null;
  closesAt: number | null;
  serverNow: number;
  playersCount: number;
  connectedCount: number;
  answeredCount: number;
  nicknames: string[];
  reveal: RevealData | null;
  leaderboard: LeaderEntry[] | null;
  phaseEnd: PhaseEndData | null;
  final: FinalData | null;
  source: string;
  benchmark: string;
}

export interface HostPlayer {
  id: string;
  nickname: string;
  team: string | null;
  balance: number;
  connected: boolean;
  isBot: boolean;
  answered: boolean;
}

export interface HostState {
  public: PublicState;
  currentQuestion: FullQuestion | null;
  nextQuestion: FullQuestion | null;
  players: HostPlayer[];
  hasNextPhase: boolean;
  isLastQuestionInPhase: boolean;
  defaultTime: number;
  autoReveal: boolean;
}

export interface MyResult {
  questionId: number;
  delta: number;
  bonus: number;
  isCorrect: boolean;
  answered: boolean;
  bet: number;
}

export interface PlayerState {
  id: string;
  nickname: string;
  team: string | null;
  balance: number;
  rank: number;
  totalPlayers: number;
  myAnswer: { questionId: number; value: unknown; bet: number } | null;
  myResult: MyResult | null;
  rescuedInPhase: number | null;
}

export type HostAction =
  | 'startPhase'
  | 'openQuestion'
  | 'lock'
  | 'reveal'
  | 'leaderboard'
  | 'next'
  | 'kick'
  | 'addBots'
  | 'removeBots'
  | 'resetGame'
  | 'setDefaultTime'
  | 'setAutoReveal'
  | 'updateQuestion'
  | 'updatePhase'
  | 'restoreBank';

export interface Ack<T = undefined> {
  ok: boolean;
  error?: string;
  data?: T;
}

export const STARTING_POINTS = 1000;
export const MIN_BET_RATIO = 0.1;
export const RESCUE_THRESHOLD = 100;
export const RESCUE_AMOUNT = 300;
export const NUMERIC_BONUS = 100;
export const MAX_NICK = 16;

export function minBet(balance: number): number {
  return Math.min(balance, Math.ceil(balance * MIN_BET_RATIO));
}
