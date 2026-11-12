import type { DatabaseSync } from 'node:sqlite';
import type { Server } from 'socket.io';
import crypto from 'node:crypto';
import { loadBankIntoRoom, seed } from './db.ts';
import { closestWinner, NUMERIC_BONUS, score } from './scoring.ts';
import {
  Ack,
  DistributionBar,
  FinalData,
  FullQuestion,
  HostPlayer,
  HostState,
  LeaderEntry,
  MAX_NICK,
  minBet,
  PhaseColor,
  PhaseEndData,
  PhaseMeta,
  PlayerState,
  PublicQuestion,
  PublicState,
  QuestionState,
  QuestionType,
  RESCUE_AMOUNT,
  RESCUE_THRESHOLD,
  RevealData,
  STARTING_POINTS,
} from '../shared/types.ts';

// ---------- Filas de la base de datos ----------
interface RoomRow {
  id: string;
  code: string;
  host_pin_hash: string;
  status: string;
  current_phase: number;
  current_question: number;
  question_state: QuestionState;
  opened_at: number | null;
  closes_at: number | null;
  default_time: number;
  auto_reveal: number;
  created_at: number;
}
interface PhaseRow {
  room_id: string;
  phase_id: number;
  title: string;
  multiplier: number;
  color: string;
  channels: string;
  drivers: string;
  phrase: string;
}
interface QuestionRow {
  id: number;
  room_id: string;
  phase: number;
  ord: number;
  type: QuestionType;
  prompt: string;
  options: string;
  answer: string;
  unit: string | null;
  min: number | null;
  max: number | null;
  step: number | null;
  reveal: string;
  host_note: string;
  multiplier: number | null;
  time_limit: number | null;
}
interface PlayerRow {
  id: string;
  room_id: string;
  token: string;
  nickname: string;
  nickname_key: string;
  team: string | null;
  balance: number;
  total_response_ms: number;
  connected: number;
  kicked: number;
  is_bot: number;
  prev_rank: number | null;
  rescued_phase: number | null;
  joined_at: number;
}
interface AnswerRow {
  id: number;
  room_id: string;
  player_id: string;
  question_id: number;
  value: string | null;
  bet: number;
  answered_at: number | null;
  response_ms: number;
  is_correct: number | null;
  delta: number | null;
  bonus: number;
}

// ---------- Utilidades ----------
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O/1/I para evitar confusiones

function randomCode(): string {
  const bytes = crypto.randomBytes(6);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

function hashPin(pin: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pin, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

function checkPin(pin: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  const test = crypto.scryptSync(pin, salt, 32);
  const real = Buffer.from(hash, 'hex');
  return test.length === real.length && crypto.timingSafeEqual(test, real);
}

export function nicknameKey(nick: string): string {
  return nick
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ]/g, '');
}

// Filtro básico de apodos ofensivos (el host además puede expulsar).
const BLOCKED = [
  'hijueputa', 'hp', 'gonorrea', 'malparido', 'malparida', 'puta', 'puto', 'marica', 'pirobo', 'pirobos',
  'culo', 'verga', 'chimba', 'mierda', 'idiota', 'estupido', 'estupida', 'imbecil', 'pendejo', 'pendeja',
  'perra', 'zorra', 'cabron', 'coño', 'fuck', 'shit', 'bitch', 'nazi', 'sexo', 'porno', 'pene', 'vagina',
];
function isOffensive(key: string): boolean {
  return BLOCKED.some((w) => (w.length <= 3 ? key === w : key.includes(w)));
}

const parse = <T>(s: string | null): T => (s === null ? (null as T) : (JSON.parse(s) as T));

// ---------- Servicio del juego ----------
export class Game {
  private revealCache = new Map<number, RevealData>();
  private leaderboardCache = new Map<string, LeaderEntry[]>();
  private lockTimers = new Map<string, NodeJS.Timeout>();
  private botTimers = new Map<string, NodeJS.Timeout[]>();
  private revealTimers = new Map<string, NodeJS.Timeout>();
  private earlyLock = new Set<string>();
  private dirty = new Map<string, 'count' | 'full'>();
  private sockets = new Map<string, Set<string>>(); // playerId -> socket ids
  private flushTimer: NodeJS.Timeout;

  constructor(
    private db: DatabaseSync,
    private io: Server,
    private opts: { flushMs?: number } = {},
  ) {
    // Al reiniciar el servidor nadie está conectado todavía (salvo bots).
    db.prepare('UPDATE players SET connected = is_bot').run();
    // Reprogramar cierres automáticos de preguntas que quedaron abiertas.
    const open = db.prepare("SELECT * FROM rooms WHERE question_state = 'open'").all() as unknown as RoomRow[];
    for (const r of open) this.scheduleLock(r);
    // Emisión en lotes (throttle) de conteos y lobby, para soportar cientos de jugadores.
    this.flushTimer = setInterval(() => this.flush(), opts.flushMs ?? 1000);
  }

  stop() {
    clearInterval(this.flushTimer);
    for (const t of this.revealTimers.values()) clearTimeout(t);
    for (const t of this.lockTimers.values()) clearTimeout(t);
    for (const ts of this.botTimers.values()) ts.forEach(clearTimeout);
  }

  // ----- lecturas -----
  room(id: string): RoomRow | undefined {
    return this.db.prepare('SELECT * FROM rooms WHERE id = ?').get(id) as unknown as RoomRow | undefined;
  }
  roomByCode(code: string): RoomRow | undefined {
    return this.db.prepare('SELECT * FROM rooms WHERE code = ?').get(String(code).toUpperCase().trim()) as unknown as
      | RoomRow
      | undefined;
  }
  player(id: string): PlayerRow | undefined {
    return this.db.prepare('SELECT * FROM players WHERE id = ?').get(id) as unknown as PlayerRow | undefined;
  }
  private phaseRows(roomId: string): PhaseRow[] {
    return this.db.prepare('SELECT * FROM phases WHERE room_id = ? ORDER BY phase_id').all(roomId) as unknown as PhaseRow[];
  }
  private questionRows(roomId: string, phase?: number): QuestionRow[] {
    if (phase === undefined)
      return this.db
        .prepare('SELECT * FROM questions WHERE room_id = ? ORDER BY phase, ord')
        .all(roomId) as unknown as QuestionRow[];
    return this.db
      .prepare('SELECT * FROM questions WHERE room_id = ? AND phase = ? ORDER BY ord')
      .all(roomId, phase) as unknown as QuestionRow[];
  }
  private currentQuestionRow(room: RoomRow): QuestionRow | undefined {
    if (room.current_phase === 0) return undefined;
    return this.db
      .prepare('SELECT * FROM questions WHERE room_id = ? AND phase = ? AND ord = ?')
      .get(room.id, room.current_phase, room.current_question) as unknown as QuestionRow | undefined;
  }
  private activePlayers(roomId: string): PlayerRow[] {
    return this.db
      .prepare('SELECT * FROM players WHERE room_id = ? AND kicked = 0 ORDER BY balance DESC, total_response_ms ASC, joined_at ASC')
      .all(roomId) as unknown as PlayerRow[];
  }

  private phaseMeta(row: PhaseRow, questionCount: number): PhaseMeta {
    return {
      id: row.phase_id,
      title: row.title,
      multiplier: row.multiplier,
      color: row.color as PhaseColor,
      channels: parse<string[]>(row.channels),
      drivers: row.drivers,
      phrase: row.phrase,
      questionCount,
    };
  }
  private phasesMeta(roomId: string): PhaseMeta[] {
    const counts = new Map<number, number>();
    for (const r of this.db
      .prepare('SELECT phase, COUNT(*) AS n FROM questions WHERE room_id = ? GROUP BY phase')
      .all(roomId) as { phase: number; n: number }[])
      counts.set(r.phase, r.n);
    return this.phaseRows(roomId).map((p) => this.phaseMeta(p, counts.get(p.phase_id) ?? 0));
  }

  private effectiveMultiplier(q: QuestionRow): number {
    if (q.multiplier !== null) return q.multiplier;
    const p = this.db
      .prepare('SELECT multiplier FROM phases WHERE room_id = ? AND phase_id = ?')
      .get(q.room_id, q.phase) as { multiplier: number } | undefined;
    return p?.multiplier ?? 1;
  }

  private publicQuestion(q: QuestionRow, room: RoomRow): PublicQuestion {
    const options = parse<string[]>(q.options);
    return {
      id: q.id,
      phase: q.phase,
      order: q.ord,
      type: q.type,
      prompt: q.prompt,
      // En Ranking los ítems se muestran barajados (igual en pantalla y celulares) y nunca en el orden correcto.
      options: q.type === 'ranking' ? presentationOrder(options, parse<string[]>(q.answer), q.id) : options,
      unit: q.unit,
      min: q.min,
      max: q.max,
      step: q.step,
      timeLimit: q.time_limit ?? room.default_time,
      multiplier: this.effectiveMultiplier(q),
    };
  }
  private fullQuestion(q: QuestionRow, room: RoomRow): FullQuestion {
    return {
      ...this.publicQuestion(q, room),
      answer: parse(q.answer),
      reveal: q.reveal,
      hostNote: q.host_note,
      multiplierOverride: q.multiplier,
    };
  }

  // ----- salas -----
  createRoom(pin: string): Ack<{ code: string; roomId: string }> {
    if (!/^\d{4,8}$/.test(pin)) return { ok: false, error: 'El PIN debe tener entre 4 y 8 dígitos.' };
    let code = randomCode();
    while (this.roomByCode(code)) code = randomCode();
    const id = crypto.randomUUID();
    this.db
      .prepare('INSERT INTO rooms (id, code, host_pin_hash, created_at) VALUES (?,?,?,?)')
      .run(id, code, hashPin(pin), Date.now());
    loadBankIntoRoom(this.db, id);
    return { ok: true, data: { code, roomId: id } };
  }

  authHost(code: string, pin: string): Ack<{ roomId: string; code: string }> {
    const room = this.roomByCode(code);
    if (!room || !checkPin(String(pin), room.host_pin_hash)) return { ok: false, error: 'Código o PIN incorrecto.' };
    return { ok: true, data: { roomId: room.id, code: room.code } };
  }

  // ----- jugadores -----
  join(code: string, nicknameRaw: string, teamRaw?: string): Ack<{ token: string; playerId: string; roomId: string }> {
    const room = this.roomByCode(code ?? '');
    if (!room) return { ok: false, error: 'No encontramos esa sala. Revisa el código.' };
    if (room.question_state === 'finished') return { ok: false, error: 'Este juego ya terminó.' };
    const nickname = String(nicknameRaw ?? '').replace(/\s+/g, ' ').trim();
    const team = String(teamRaw ?? '').replace(/\s+/g, ' ').trim().slice(0, 24) || null;
    if (nickname.length < 2) return { ok: false, error: 'El apodo debe tener al menos 2 caracteres.' };
    if ([...nickname].length > MAX_NICK) return { ok: false, error: `El apodo puede tener máximo ${MAX_NICK} caracteres.` };
    const key = nicknameKey(nickname);
    if (!key) return { ok: false, error: 'El apodo debe tener letras o números.' };
    if (isOffensive(key) || (team && isOffensive(nicknameKey(team))))
      return { ok: false, error: 'Ese apodo no está permitido. Elige otro.' };
    const exists = this.db
      .prepare('SELECT 1 FROM players WHERE room_id = ? AND nickname_key = ?')
      .get(room.id, key);
    if (exists) return { ok: false, error: 'Ese apodo ya está en uso en la sala. Prueba con otro.' };

    const id = crypto.randomUUID();
    const token = crypto.randomBytes(24).toString('base64url');
    this.db
      .prepare(
        'INSERT INTO players (id, room_id, token, nickname, nickname_key, team, balance, joined_at) VALUES (?,?,?,?,?,?,?,?)',
      )
      .run(id, room.id, token, nickname, key, team, STARTING_POINTS, Date.now());
    this.markDirty(room.id, 'full');
    return { ok: true, data: { token, playerId: id, roomId: room.id } };
  }

  resume(token: string): PlayerRow | undefined {
    const p = this.db.prepare('SELECT * FROM players WHERE token = ?').get(String(token ?? '')) as unknown as
      | PlayerRow
      | undefined;
    if (!p || p.kicked) return undefined;
    return p;
  }

  attachSocket(playerId: string, socketId: string) {
    let set = this.sockets.get(playerId);
    if (!set) this.sockets.set(playerId, (set = new Set()));
    set.add(socketId);
    const p = this.player(playerId);
    if (p && !p.connected) {
      this.db.prepare('UPDATE players SET connected = 1 WHERE id = ?').run(playerId);
      this.markDirty(p.room_id, 'count');
    }
  }
  detachSocket(playerId: string, socketId: string) {
    const set = this.sockets.get(playerId);
    if (!set) return;
    set.delete(socketId);
    if (set.size === 0) {
      this.sockets.delete(playerId);
      const p = this.player(playerId);
      if (p) {
        this.db.prepare('UPDATE players SET connected = 0 WHERE id = ?').run(playerId);
        this.markDirty(p.room_id, 'count');
      }
    }
  }

  submitAnswer(playerId: string, body: { questionId: number; value: unknown; bet: number }): Ack {
    const p = this.player(playerId);
    if (!p || p.kicked) return { ok: false, error: 'Jugador no válido.' };
    const room = this.room(p.room_id)!;
    if (room.question_state !== 'open') return { ok: false, error: 'Las apuestas están cerradas.' };
    const q = this.currentQuestionRow(room);
    if (!q || q.id !== Number(body?.questionId)) return { ok: false, error: 'Esta pregunta ya no está activa.' };
    const now = Date.now();
    if (room.closes_at && now > room.closes_at + 1500) return { ok: false, error: 'Se acabó el tiempo.' };
    if (this.db.prepare('SELECT 1 FROM answers WHERE player_id = ? AND question_id = ?').get(p.id, q.id))
      return { ok: false, error: 'Ya registraste tu apuesta para esta pregunta.' };

    const value = this.validateValue(q, body?.value);
    if (value === undefined) return { ok: false, error: 'Respuesta no válida.' };
    const bet = Math.floor(Number(body?.bet));
    const min = minBet(p.balance);
    if (!Number.isFinite(bet) || bet < min || bet > p.balance)
      return { ok: false, error: `La apuesta debe estar entre ${min} y ${p.balance} puntos.` };

    this.db
      .prepare(
        'INSERT INTO answers (room_id, player_id, question_id, value, bet, answered_at, response_ms) VALUES (?,?,?,?,?,?,?)',
      )
      .run(room.id, p.id, q.id, JSON.stringify(value), bet, now, Math.max(0, now - (room.opened_at ?? now)));
    this.markDirty(room.id, 'count');
    this.maybeLockEarly(room, q.id);
    return { ok: true };
  }

  /** Modo automático: si todos los jugadores conectados ya apostaron, se cierra antes de tiempo. */
  private maybeLockEarly(room: RoomRow, questionId: number) {
    if (!room.auto_reveal || this.earlyLock.has(room.id)) return;
    const { conn } = this.db
      .prepare('SELECT COUNT(*) AS conn FROM players WHERE room_id = ? AND kicked = 0 AND connected = 1')
      .get(room.id) as { conn: number };
    const { n } = this.db
      .prepare('SELECT COUNT(*) AS n FROM answers a JOIN players p ON p.id = a.player_id WHERE a.question_id = ? AND a.value IS NOT NULL AND p.connected = 1 AND p.kicked = 0')
      .get(questionId) as { n: number };
    if (conn === 0 || n < conn) return;
    this.earlyLock.add(room.id);
    setTimeout(() => {
      this.earlyLock.delete(room.id);
      const r = this.room(room.id);
      if (r && r.question_state === 'open' && r.opened_at === room.opened_at) this.lock(room.id);
    }, 1200);
  }

  private validateValue(q: QuestionRow, v: unknown): unknown {
    const options = parse<string[]>(q.options);
    switch (q.type) {
      case 'mito_realidad':
        return v === 'MITO' || v === 'REALIDAD' ? v : undefined;
      case 'intruso':
        return typeof v === 'string' && options.includes(v) ? v : undefined;
      case 'ranking': {
        if (!Array.isArray(v) || v.length !== options.length) return undefined;
        const sorted = [...v].map(String).sort();
        const want = [...options].sort();
        return sorted.every((x, i) => x === want[i]) ? v.map(String) : undefined;
      }
      case 'numeric': {
        const n = Number(v);
        if (!Number.isFinite(n)) return undefined;
        const lo = q.min ?? -Infinity;
        const hi = q.max ?? Infinity;
        return Math.min(hi, Math.max(lo, n));
      }
    }
  }

  // ----- acciones del host -----
  hostAction(roomId: string, action: string, payload: Record<string, unknown> = {}): Ack {
    const room = this.room(roomId);
    if (!room) return { ok: false, error: 'Sala no encontrada.' };
    const s = room.question_state;
    const fail = (error: string): Ack => ({ ok: false, error });
    switch (action) {
      case 'startPhase': {
        if (s !== 'lobby' && s !== 'phase_end') return fail('Solo puedes iniciar una fase desde el lobby o al terminar una fase.');
        const next = this.nextPhaseId(room);
        if (next === null) return fail('No hay más fases.');
        this.startPhase(room, next);
        break;
      }
      case 'openQuestion': {
        if (s !== 'phase_intro' && s !== 'ready') return fail('No hay una pregunta lista para abrir.');
        const t = payload.timeLimit === undefined ? undefined : Math.round(Number(payload.timeLimit));
        if (t !== undefined && (!Number.isFinite(t) || t < 5 || t > 600)) return fail('El tiempo debe estar entre 5 y 600 segundos.');
        this.openQuestion(room, t);
        break;
      }
      case 'lock':
        if (s !== 'open') return fail('No hay apuestas abiertas.');
        this.lock(room.id);
        return { ok: true };
      case 'reveal':
        if (s === 'revealed') return { ok: true }; // ya lo reveló el modo automático
        if (s !== 'locked') return fail('Primero cierra las apuestas.');
        clearTimeout(this.revealTimers.get(room.id));
        this.reveal(room);
        break;
      case 'leaderboard':
        if (s !== 'revealed') return fail('Primero revela la respuesta.');
        this.showLeaderboard(room);
        break;
      case 'next':
        if (s === 'revealed' || s === 'leaderboard') this.nextQuestion(room);
        else if (s === 'phase_end') {
          const n = this.nextPhaseId(room);
          if (n === null) this.finish(room);
          else this.startPhase(room, n);
        } else return fail('Aún no puedes avanzar.');
        break;
      case 'kick':
        return this.kick(room, String(payload.playerId ?? ''));
      case 'addBots':
        this.addBots(room, Math.min(100, Math.max(1, Number(payload.count ?? 20))));
        return { ok: true };
      case 'removeBots':
        this.db.prepare('DELETE FROM players WHERE room_id = ? AND is_bot = 1').run(room.id);
        this.revealCache.clear();
        break;
      case 'resetGame':
        this.resetGame(room);
        break;
      case 'setAutoReveal':
        this.db.prepare('UPDATE rooms SET auto_reveal = ? WHERE id = ?').run(payload.enabled ? 1 : 0, room.id);
        break;
      case 'setDefaultTime': {
        const t = Math.round(Number(payload.seconds));
        if (!Number.isFinite(t) || t < 5 || t > 600) return fail('El tiempo debe estar entre 5 y 600 segundos.');
        this.db.prepare('UPDATE rooms SET default_time = ? WHERE id = ?').run(t, room.id);
        break;
      }
      case 'updateQuestion':
        return this.withBroadcast(room.id, this.updateQuestion(room, payload));
      case 'updatePhase':
        return this.withBroadcast(room.id, this.updatePhase(room, payload));
      case 'restoreBank': {
        const n = this.db.prepare('SELECT COUNT(*) AS n FROM answers WHERE room_id = ?').get(room.id) as { n: number };
        if (n.n > 0 || room.current_phase !== 0) return fail('Reinicia la partida antes de restaurar el banco original.');
        loadBankIntoRoom(this.db, room.id);
        break;
      }
      default:
        return fail('Acción desconocida.');
    }
    this.broadcast(room.id);
    return { ok: true };
  }

  private withBroadcast(roomId: string, ack: Ack): Ack {
    if (ack.ok) this.broadcast(roomId);
    return ack;
  }

  private nextPhaseId(room: RoomRow): number | null {
    const row = this.db
      .prepare(
        'SELECT p.phase_id FROM phases p WHERE p.room_id = ? AND p.phase_id > ? AND EXISTS (SELECT 1 FROM questions q WHERE q.room_id = p.room_id AND q.phase = p.phase_id) ORDER BY p.phase_id LIMIT 1',
      )
      .get(room.id, room.current_phase) as { phase_id: number } | undefined;
    return row?.phase_id ?? null;
  }

  private setState(roomId: string, fields: Partial<RoomRow>) {
    const keys = Object.keys(fields);
    const sql = `UPDATE rooms SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`;
    this.db.prepare(sql).run(...(keys.map((k) => (fields as Record<string, unknown>)[k]) as never[]), roomId);
  }

  private startPhase(room: RoomRow, phaseId: number) {
    // Rescate: si el saldo es menor a 100 al iniciar la fase, se recarga a 300.
    this.db
      .prepare('UPDATE players SET balance = ?, rescued_phase = ? WHERE room_id = ? AND kicked = 0 AND balance < ?')
      .run(RESCUE_AMOUNT, phaseId, room.id, RESCUE_THRESHOLD);
    this.setState(room.id, {
      status: 'playing',
      current_phase: phaseId,
      current_question: 0,
      question_state: 'phase_intro',
      opened_at: null,
      closes_at: null,
    });
  }

  private openQuestion(room: RoomRow, overrideSeconds?: number) {
    const q = this.currentQuestionRow(room)!;
    const seconds = overrideSeconds ?? q.time_limit ?? room.default_time;
    const now = Date.now();
    this.setState(room.id, { question_state: 'open', opened_at: now, closes_at: now + seconds * 1000 });
    this.scheduleLock(this.room(room.id)!);
    this.scheduleBots(this.room(room.id)!, q);
  }

  private scheduleLock(room: RoomRow) {
    clearTimeout(this.lockTimers.get(room.id));
    const ms = Math.max(0, (room.closes_at ?? Date.now()) - Date.now() + 800);
    this.lockTimers.set(
      room.id,
      setTimeout(() => {
        const r = this.room(room.id);
        if (r && r.question_state === 'open' && r.opened_at === room.opened_at) this.lock(room.id);
      }, ms),
    );
  }

  lock(roomId: string) {
    clearTimeout(this.lockTimers.get(roomId));
    this.lockTimers.delete(roomId);
    (this.botTimers.get(roomId) ?? []).forEach(clearTimeout);
    this.botTimers.delete(roomId);
    this.setState(roomId, { question_state: 'locked' });
    this.broadcast(roomId);
    const room = this.room(roomId);
    if (room?.auto_reveal) {
      clearTimeout(this.revealTimers.get(roomId));
      this.revealTimers.set(
        roomId,
        setTimeout(() => {
          this.revealTimers.delete(roomId);
          const r = this.room(roomId);
          if (r && r.question_state === 'locked' && r.opened_at === room.opened_at) {
            this.reveal(r);
            this.broadcast(roomId);
          }
        }, 2500),
      );
    }
  }

  /** Calcula el puntaje de todos los jugadores en el servidor (una sola transacción). */
  private reveal(room: RoomRow) {
    const q = this.currentQuestionRow(room)!;
    const mult = this.effectiveMultiplier(q);
    const answer = parse<unknown>(q.answer);
    const limitMs = Math.max(0, (room.closes_at ?? 0) - (room.opened_at ?? 0));
    const players = this.db
      .prepare('SELECT * FROM players WHERE room_id = ? AND kicked = 0 AND joined_at <= ?')
      .all(room.id, room.closes_at ?? Date.now()) as unknown as PlayerRow[];
    const answers = new Map(
      (this.db.prepare('SELECT * FROM answers WHERE question_id = ?').all(q.id) as unknown as AnswerRow[]).map((a) => [
        a.player_id,
        a,
      ]),
    );

    const insMissing = this.db.prepare(
      'INSERT INTO answers (room_id, player_id, question_id, value, bet, response_ms, is_correct, delta) VALUES (?,?,?,NULL,?,?,0,?)',
    );
    const updAns = this.db.prepare('UPDATE answers SET is_correct = ?, delta = ? WHERE id = ?');
    const updPlayer = this.db.prepare(
      'UPDATE players SET balance = balance + ?, total_response_ms = total_response_ms + ? WHERE id = ?',
    );
    const numericRows: { playerId: string; answerId: number; error: number; responseMs: number }[] = [];

    this.db.exec('BEGIN');
    try {
      for (const p of players) {
        const a = answers.get(p.id);
        if (!a) {
          const bet = minBet(p.balance);
          const r = score({ type: q.type, answer, value: null, bet, balance: p.balance, multiplier: mult });
          insMissing.run(room.id, p.id, q.id, bet, limitMs, r.delta);
          updPlayer.run(r.delta, limitMs, p.id);
          continue;
        }
        if (a.delta !== null) continue; // ya calculado (idempotencia)
        const r = score({
          type: q.type,
          answer,
          value: parse(a.value),
          bet: a.bet,
          balance: p.balance,
          multiplier: mult,
        });
        updAns.run(r.isCorrect ? 1 : 0, r.delta, a.id);
        updPlayer.run(r.delta, a.response_ms, p.id);
        if (q.type === 'numeric' && r.error !== undefined)
          numericRows.push({ playerId: p.id, answerId: a.id, error: r.error, responseMs: a.response_ms });
      }
      const winner = closestWinner(numericRows);
      if (winner) {
        this.db.prepare('UPDATE answers SET bonus = ? WHERE id = ?').run(NUMERIC_BONUS, winner.answerId);
        this.db.prepare('UPDATE players SET balance = balance + ? WHERE id = ?').run(NUMERIC_BONUS, winner.playerId);
      }
      this.setState(room.id, { question_state: 'revealed' });
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
    this.revealCache.delete(q.id);
  }

  private showLeaderboard(room: RoomRow) {
    const players = this.activePlayers(room.id);
    const entries: LeaderEntry[] = players.map((p, i) => ({
      playerId: p.id,
      nickname: p.nickname,
      team: p.team,
      balance: p.balance,
      rank: i + 1,
      prevRank: p.prev_rank,
    }));
    const upd = this.db.prepare('UPDATE players SET prev_rank = ? WHERE id = ?');
    this.db.exec('BEGIN');
    entries.forEach((e) => upd.run(e.rank, e.playerId));
    this.db.exec('COMMIT');
    this.leaderboardCache.set(room.id, entries.slice(0, 10));
    this.setState(room.id, { question_state: 'leaderboard' });
  }

  private nextQuestion(room: RoomRow) {
    const count = this.questionRows(room.id, room.current_phase).length;
    if (room.current_question + 1 < count) {
      this.setState(room.id, {
        current_question: room.current_question + 1,
        question_state: 'ready',
        opened_at: null,
        closes_at: null,
      });
    } else {
      this.setState(room.id, { question_state: 'phase_end' });
    }
  }

  private finish(room: RoomRow) {
    this.setState(room.id, { question_state: 'finished', status: 'finished' });
  }

  private kick(room: RoomRow, playerId: string): Ack {
    const p = this.player(playerId);
    if (!p || p.room_id !== room.id) return { ok: false, error: 'Jugador no encontrado.' };
    this.db.prepare('UPDATE players SET kicked = 1, connected = 0 WHERE id = ?').run(p.id);
    this.io.to(`p:${p.id}`).emit('kicked');
    this.io.in(`p:${p.id}`).disconnectSockets(true);
    this.revealCache.clear();
    this.broadcast(room.id);
    return { ok: true };
  }

  private resetGame(room: RoomRow) {
    clearTimeout(this.lockTimers.get(room.id));
    clearTimeout(this.revealTimers.get(room.id));
    (this.botTimers.get(room.id) ?? []).forEach(clearTimeout);
    this.db.prepare('DELETE FROM answers WHERE room_id = ?').run(room.id);
    this.db
      .prepare(
        'UPDATE players SET balance = ?, total_response_ms = 0, prev_rank = NULL, rescued_phase = NULL WHERE room_id = ?',
      )
      .run(STARTING_POINTS, room.id);
    this.setState(room.id, {
      status: 'lobby',
      current_phase: 0,
      current_question: 0,
      question_state: 'lobby',
      opened_at: null,
      closes_at: null,
    });
    this.revealCache.clear();
    this.leaderboardCache.delete(room.id);
  }

  private updateQuestion(room: RoomRow, p: Record<string, unknown>): Ack {
    const q = this.db
      .prepare('SELECT * FROM questions WHERE id = ? AND room_id = ?')
      .get(Number(p.id), room.id) as unknown as QuestionRow | undefined;
    if (!q) return { ok: false, error: 'Pregunta no encontrada.' };
    const played = this.db.prepare('SELECT 1 FROM answers WHERE question_id = ? LIMIT 1').get(q.id);
    const cur = this.currentQuestionRow(room);
    if (played || (cur?.id === q.id && room.question_state === 'open'))
      return { ok: false, error: 'Esta pregunta ya se jugó. Reinicia la partida para editarla.' };

    const str = (v: unknown, fallback: string) => (typeof v === 'string' ? v.trim() : fallback);
    const numOrNull = (v: unknown, fallback: number | null) =>
      v === undefined ? fallback : v === null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : fallback;

    const prompt = str(p.prompt, q.prompt);
    if (!prompt) return { ok: false, error: 'El enunciado no puede estar vacío.' };
    let options = Array.isArray(p.options) ? (p.options as unknown[]).map((x) => String(x).trim()).filter(Boolean) : parse<string[]>(q.options);
    let answer: unknown = p.answer === undefined ? parse(q.answer) : p.answer;
    switch (q.type) {
      case 'mito_realidad':
        options = [];
        if (answer !== 'MITO' && answer !== 'REALIDAD') return { ok: false, error: 'La respuesta debe ser MITO o REALIDAD.' };
        break;
      case 'intruso':
        if (options.length < 2) return { ok: false, error: 'Se necesitan al menos 2 opciones.' };
        if (!options.includes(String(answer))) return { ok: false, error: 'La respuesta correcta debe ser una de las opciones.' };
        break;
      case 'ranking': {
        if (!Array.isArray(answer)) return { ok: false, error: 'El orden correcto debe ser una lista.' };
        const a = (answer as unknown[]).map((x) => String(x).trim());
        if (a.length !== options.length || [...a].sort().join('|') !== [...options].sort().join('|'))
          return { ok: false, error: 'El orden correcto debe contener exactamente los mismos ítems.' };
        if (new Set(options).size !== options.length) return { ok: false, error: 'Los ítems no pueden repetirse.' };
        answer = a;
        break;
      }
      case 'numeric': {
        const n = Number(answer);
        if (!Number.isFinite(n)) return { ok: false, error: 'La respuesta debe ser un número.' };
        answer = n;
        break;
      }
    }
    const min = numOrNull(p.min, q.min);
    const max = numOrNull(p.max, q.max);
    if (q.type === 'numeric' && (min === null || max === null || min >= max))
      return { ok: false, error: 'Revisa el mínimo y el máximo.' };
    const timeLimit = numOrNull(p.timeLimit, q.time_limit);
    if (timeLimit !== null && (timeLimit < 5 || timeLimit > 600)) return { ok: false, error: 'El tiempo debe estar entre 5 y 600 s.' };
    const mult = numOrNull(p.multiplierOverride, q.multiplier);
    if (mult !== null && (mult <= 0 || mult > 10)) return { ok: false, error: 'Multiplicador no válido.' };

    this.db
      .prepare(
        `UPDATE questions SET prompt = ?, options = ?, answer = ?, unit = ?, min = ?, max = ?, step = ?, reveal = ?,
         host_note = ?, time_limit = ?, multiplier = ? WHERE id = ?`,
      )
      .run(
        prompt,
        JSON.stringify(options),
        JSON.stringify(answer),
        q.type === 'numeric' ? str(p.unit, q.unit ?? '') || null : null,
        q.type === 'numeric' ? min : null,
        q.type === 'numeric' ? max : null,
        q.type === 'numeric' ? numOrNull(p.step, q.step) : null,
        str(p.reveal, q.reveal),
        str(p.hostNote, q.host_note),
        timeLimit === null ? null : Math.round(timeLimit),
        mult,
        q.id,
      );
    return { ok: true };
  }

  private updatePhase(room: RoomRow, p: Record<string, unknown>): Ack {
    const row = this.db
      .prepare('SELECT * FROM phases WHERE room_id = ? AND phase_id = ?')
      .get(room.id, Number(p.phaseId)) as unknown as PhaseRow | undefined;
    if (!row) return { ok: false, error: 'Fase no encontrada.' };
    const title = typeof p.title === 'string' && p.title.trim() ? p.title.trim() : row.title;
    const mult = p.multiplier === undefined ? row.multiplier : Number(p.multiplier);
    if (!Number.isFinite(mult) || mult <= 0 || mult > 10) return { ok: false, error: 'Multiplicador no válido.' };
    const channels = Array.isArray(p.channels)
      ? JSON.stringify((p.channels as unknown[]).map((x) => String(x).trim()).filter(Boolean))
      : row.channels;
    this.db
      .prepare('UPDATE phases SET title = ?, multiplier = ?, phrase = ?, drivers = ?, channels = ? WHERE room_id = ? AND phase_id = ?')
      .run(
        title,
        mult,
        typeof p.phrase === 'string' ? p.phrase.trim() : row.phrase,
        typeof p.drivers === 'string' ? p.drivers.trim() : row.drivers,
        channels,
        room.id,
        row.phase_id,
      );
    return { ok: true };
  }

  // ----- modo demo -----
  private addBots(room: RoomRow, count: number) {
    const ins = this.db.prepare(
      'INSERT INTO players (id, room_id, token, nickname, nickname_key, team, balance, connected, is_bot, joined_at) VALUES (?,?,?,?,?,?,?,1,1,?)',
    );
    let n = 1;
    let added = 0;
    const teams = ['Ventas', 'Marketing', 'Trade', 'Insights'];
    while (added < count) {
      const nick = `Bot ${String(n).padStart(2, '0')}`;
      const key = nicknameKey(nick);
      n++;
      if (this.db.prepare('SELECT 1 FROM players WHERE room_id = ? AND nickname_key = ?').get(room.id, key)) continue;
      ins.run(crypto.randomUUID(), room.id, crypto.randomBytes(24).toString('base64url'), nick, key, teams[added % 4], STARTING_POINTS, Date.now());
      added++;
    }
    this.broadcast(room.id);
    // Si ya hay una pregunta abierta, los bots nuevos también responden.
    const r = this.room(room.id)!;
    if (r.question_state === 'open') this.scheduleBots(r, this.currentQuestionRow(r)!);
  }

  private scheduleBots(room: RoomRow, q: QuestionRow) {
    const bots = this.db
      .prepare('SELECT id FROM players WHERE room_id = ? AND is_bot = 1 AND kicked = 0')
      .all(room.id) as { id: string }[];
    const windowMs = Math.max(1000, (room.closes_at ?? 0) - Date.now() - 1500);
    const options = parse<string[]>(q.options);
    const timers = this.botTimers.get(room.id) ?? [];
    for (const b of bots) {
      // ~10% de los bots no responden, para probar la penalización.
      if (Math.random() < 0.1) continue;
      const delay = 800 + Math.random() * windowMs;
      timers.push(
        setTimeout(() => {
          const p = this.player(b.id);
          if (!p) return;
          let value: unknown;
          if (q.type === 'mito_realidad') value = Math.random() < 0.5 ? 'MITO' : 'REALIDAD';
          else if (q.type === 'intruso') value = options[Math.floor(Math.random() * options.length)];
          else if (q.type === 'ranking') value = [...options].sort(() => Math.random() - 0.5);
          else {
            const lo = q.min ?? 0;
            const hi = q.max ?? 100;
            const step = q.step ?? 1;
            value = Math.round((lo + Math.random() * (hi - lo)) / step) * step;
          }
          const ratios = [0.1, 0.1, 0.25, 0.25, 0.5, 1];
          const ratio = ratios[Math.floor(Math.random() * ratios.length)];
          const bet = Math.max(minBet(p.balance), Math.min(p.balance, Math.round(p.balance * ratio)));
          this.submitAnswer(p.id, { questionId: q.id, value, bet });
        }, delay),
      );
    }
    this.botTimers.set(room.id, timers);
  }

  // ----- vistas -----
  private computeReveal(room: RoomRow, q: QuestionRow): RevealData {
    const cached = this.revealCache.get(q.id);
    if (cached) return cached;
    const rows = this.db
      .prepare(
        `SELECT a.*, p.nickname FROM answers a JOIN players p ON p.id = a.player_id
         WHERE a.question_id = ? AND p.kicked = 0 AND a.value IS NOT NULL`,
      )
      .all(q.id) as unknown as (AnswerRow & { nickname: string })[];
    const answer = parse<string | number | string[]>(q.answer);
    const options = parse<string[]>(q.options);
    const n = rows.length;
    const pct = (k: number) => (n ? Math.round((k / n) * 1000) / 10 : 0);
    const correct = rows.filter((r) => r.is_correct === 1).length;
    let bars: DistributionBar[] = [];
    const data: RevealData = {
      questionId: q.id,
      type: q.type,
      correctAnswer: answer,
      reveal: q.reveal,
      source: seed.source,
      respondents: n,
      correctPct: pct(correct),
      bars,
    };

    if (q.type === 'mito_realidad' || q.type === 'intruso') {
      const labels = q.type === 'mito_realidad' ? ['MITO', 'REALIDAD'] : options;
      bars = labels.map((l) => {
        const k = rows.filter((r) => parse(r.value) === l).length;
        return { label: l, count: k, pct: pct(k), correct: l === answer };
      });
    } else if (q.type === 'ranking') {
      const ans = answer as string[];
      const posSum = new Map<string, number>(options.map((o) => [o, 0]));
      const hits = new Map<string, number>(options.map((o) => [o, 0]));
      for (const r of rows) {
        const v = parse<string[]>(r.value);
        v.forEach((item, i) => {
          posSum.set(item, (posSum.get(item) ?? 0) + i);
          if (ans[i] === item) hits.set(item, (hits.get(item) ?? 0) + 1);
        });
      }
      bars = ans.map((item, i) => ({ label: `${i + 1}. ${item}`, count: hits.get(item) ?? 0, pct: pct(hits.get(item) ?? 0), correct: true }));
      data.roomOrder = n ? [...options].sort((a, b) => (posSum.get(a) ?? 0) - (posSum.get(b) ?? 0)) : [];
    } else {
      const vals = rows.map((r) => Number(parse(r.value)));
      const lo = q.min ?? Math.min(...vals, Number(answer));
      const hi = q.max ?? Math.max(...vals, Number(answer));
      const BINS = 10;
      const w = (hi - lo) / BINS || 1;
      const counts = new Array(BINS).fill(0);
      for (const v of vals) counts[Math.min(BINS - 1, Math.max(0, Math.floor((v - lo) / w)))]++;
      const realBin = Math.min(BINS - 1, Math.max(0, Math.floor((Number(answer) - lo) / w)));
      bars = counts.map((k, i) => ({
        label: `${fmtNum(lo + i * w)}–${fmtNum(lo + (i + 1) * w)}`,
        count: k,
        pct: pct(k),
        correct: i === realBin,
      }));
      if (n) {
        const sorted = [...vals].sort((a, b) => a - b);
        data.roomAverage = Math.round((vals.reduce((s, v) => s + v, 0) / n) * 10) / 10;
        data.roomMedian = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
      }
      const w2 = rows.find((r) => r.bonus > 0);
      data.closest = w2 ? { nickname: w2.nickname, value: Number(parse(w2.value)) } : null;
    }
    data.bars = bars;
    this.revealCache.set(q.id, data);
    return data;
  }

  private computePhaseEnd(room: RoomRow): PhaseEndData {
    const podium = this.db
      .prepare(
        `SELECT p.nickname, p.team, SUM(a.delta + a.bonus) AS gained, SUM(a.response_ms) AS ms
         FROM answers a JOIN questions q ON q.id = a.question_id JOIN players p ON p.id = a.player_id
         WHERE q.room_id = ? AND q.phase = ? AND p.kicked = 0 AND a.delta IS NOT NULL
         GROUP BY p.id ORDER BY gained DESC, ms ASC LIMIT 3`,
      )
      .all(room.id, room.current_phase) as { nickname: string; team: string | null; gained: number }[];
    const stats = this.db
      .prepare(
        `SELECT q.prompt, AVG(CASE WHEN a.is_correct = 1 THEN 100.0 ELSE 0 END) AS pct
         FROM questions q JOIN answers a ON a.question_id = q.id JOIN players p ON p.id = a.player_id
         WHERE q.room_id = ? AND q.phase = ? AND a.value IS NOT NULL AND p.kicked = 0
         GROUP BY q.id ORDER BY pct ASC`,
      )
      .all(room.id, room.current_phase) as { prompt: string; pct: number }[];
    const avg = stats.length ? stats.reduce((s, r) => s + r.pct, 0) / stats.length : 0;
    return {
      phaseId: room.current_phase,
      podium: podium.map((p) => ({ nickname: p.nickname, team: p.team, gained: p.gained })),
      worstQuestion: stats[0] ? { prompt: stats[0].prompt, correctPct: Math.round(stats[0].pct * 10) / 10 } : null,
      averageCorrectPct: Math.round(avg * 10) / 10,
    };
  }

  private computeFinal(room: RoomRow): FinalData {
    const top = this.activePlayers(room.id)
      .slice(0, 10)
      .map((p, i) => ({ playerId: p.id, nickname: p.nickname, team: p.team, balance: p.balance, rank: i + 1, prevRank: p.prev_rank }));
    return { podium: top.slice(0, 3), top };
  }

  publicState(roomId: string): PublicState {
    const room = this.room(roomId)!;
    const phases = this.phasesMeta(room.id);
    const phase = phases.find((p) => p.id === room.current_phase) ?? null;
    const q = this.currentQuestionRow(room);
    const s = room.question_state;
    const showQ = q && ['open', 'locked', 'revealed', 'leaderboard'].includes(s);
    const counts = this.db
      .prepare('SELECT COUNT(*) AS total, SUM(connected) AS conn FROM players WHERE room_id = ? AND kicked = 0')
      .get(room.id) as { total: number; conn: number | null };
    const answered =
      q && showQ
        ? (this.db.prepare('SELECT COUNT(*) AS n FROM answers WHERE question_id = ? AND value IS NOT NULL').get(q.id) as { n: number }).n
        : 0;
    const nicknames =
      s === 'lobby'
        ? (this.db
            .prepare('SELECT nickname FROM players WHERE room_id = ? AND kicked = 0 ORDER BY joined_at DESC LIMIT 80')
            .all(room.id) as { nickname: string }[]).map((r) => r.nickname)
        : [];
    return {
      code: room.code,
      state: s,
      phase,
      phases,
      questionIndex: room.current_question,
      question: showQ ? this.publicQuestion(q!, room) : null,
      teaserType: q && s === 'ready' ? q.type : null,
      openedAt: room.opened_at,
      closesAt: room.closes_at,
      serverNow: Date.now(),
      playersCount: counts.total,
      connectedCount: counts.conn ?? 0,
      answeredCount: answered,
      nicknames,
      reveal: q && (s === 'revealed' || s === 'leaderboard') ? this.computeReveal(room, q) : null,
      leaderboard: s === 'leaderboard' ? this.leaderboardCache.get(room.id) ?? this.computeFinal(room).top : null,
      phaseEnd: s === 'phase_end' ? this.computePhaseEnd(room) : null,
      final: s === 'finished' ? this.computeFinal(room) : null,
      source: seed.source,
      benchmark: seed.benchmark,
    };
  }

  hostState(roomId: string, pub = this.publicState(roomId)): HostState {
    const room = this.room(roomId)!;
    const q = this.currentQuestionRow(room);
    const answeredIds = new Set(
      q
        ? (this.db.prepare('SELECT player_id FROM answers WHERE question_id = ? AND value IS NOT NULL').all(q.id) as {
            player_id: string;
          }[]).map((r) => r.player_id)
        : [],
    );
    const players: HostPlayer[] = this.activePlayers(room.id).map((p) => ({
      id: p.id,
      nickname: p.nickname,
      team: p.team,
      balance: p.balance,
      connected: !!p.connected,
      isBot: !!p.is_bot,
      answered: answeredIds.has(p.id),
    }));
    const phaseQs = room.current_phase ? this.questionRows(room.id, room.current_phase) : [];
    let upcoming: QuestionRow | undefined;
    if (room.question_state === 'lobby' || room.question_state === 'phase_end') {
      const np = this.nextPhaseId(room);
      upcoming = np === null ? undefined : this.questionRows(room.id, np)[0];
    } else if (room.question_state === 'revealed' || room.question_state === 'leaderboard') {
      upcoming = phaseQs[room.current_question + 1];
    }
    return {
      public: pub,
      currentQuestion: q && room.question_state !== 'lobby' && room.question_state !== 'phase_end' && room.question_state !== 'finished'
        ? this.fullQuestion(q, room)
        : null,
      nextQuestion: upcoming ? this.fullQuestion(upcoming, room) : null,
      players,
      hasNextPhase: this.nextPhaseId(room) !== null,
      isLastQuestionInPhase: room.current_question + 1 >= phaseQs.length,
      defaultTime: room.default_time,
      autoReveal: !!room.auto_reveal,
    };
  }

  bank(roomId: string): { phases: PhaseMeta[]; questions: (FullQuestion & { played: boolean })[] } {
    const room = this.room(roomId)!;
    const played = new Set(
      (this.db.prepare('SELECT DISTINCT question_id FROM answers WHERE room_id = ?').all(roomId) as { question_id: number }[]).map(
        (r) => r.question_id,
      ),
    );
    return {
      phases: this.phasesMeta(roomId),
      questions: this.questionRows(roomId).map((q) => ({ ...this.fullQuestion(q, room), played: played.has(q.id) })),
    };
  }

  playerState(playerId: string, ranks?: Map<string, number>, total?: number): PlayerState | null {
    const p = this.player(playerId);
    if (!p) return null;
    const room = this.room(p.room_id)!;
    if (!ranks) {
      const list = this.activePlayers(room.id);
      ranks = new Map(list.map((x, i) => [x.id, i + 1]));
      total = list.length;
    }
    const q = this.currentQuestionRow(room);
    const a = q
      ? (this.db.prepare('SELECT * FROM answers WHERE player_id = ? AND question_id = ?').get(p.id, q.id) as unknown as
          | AnswerRow
          | undefined)
      : undefined;
    const revealed = room.question_state === 'revealed' || room.question_state === 'leaderboard';
    return {
      id: p.id,
      nickname: p.nickname,
      team: p.team,
      balance: p.balance,
      rank: ranks.get(p.id) ?? 0,
      totalPlayers: total ?? 0,
      myAnswer: a && a.value !== null ? { questionId: a.question_id, value: parse(a.value), bet: a.bet } : null,
      myResult:
        a && revealed && a.delta !== null
          ? {
              questionId: a.question_id,
              delta: a.delta,
              bonus: a.bonus,
              isCorrect: a.is_correct === 1,
              answered: a.value !== null,
              bet: a.bet,
            }
          : null,
      rescuedInPhase: p.rescued_phase !== null && p.rescued_phase === room.current_phase ? p.rescued_phase : null,
    };
  }

  // ----- difusión -----
  markDirty(roomId: string, kind: 'count' | 'full') {
    if (kind === 'full' || !this.dirty.has(roomId)) this.dirty.set(roomId, kind);
  }

  private flush() {
    const entries = [...this.dirty.entries()];
    this.dirty.clear();
    for (const [roomId, kind] of entries) {
      if (!this.room(roomId)) continue;
      const pub = this.publicState(roomId);
      if (kind === 'full') this.io.to(`r:${roomId}`).emit('state', pub);
      else
        this.io.to(`r:${roomId}`).emit('count', {
          answeredCount: pub.answeredCount,
          playersCount: pub.playersCount,
          connectedCount: pub.connectedCount,
        });
      this.io.to(`h:${roomId}`).emit('host:state', this.hostState(roomId, pub));
    }
  }

  /** Emisión inmediata en cada transición: estado público, estado del host y estado personal de cada jugador. */
  broadcast(roomId: string) {
    this.dirty.delete(roomId);
    const pub = this.publicState(roomId);
    this.io.to(`r:${roomId}`).emit('state', pub);
    this.io.to(`h:${roomId}`).emit('host:state', this.hostState(roomId, pub));
    const list = this.activePlayers(roomId);
    const ranks = new Map(list.map((x, i) => [x.id, i + 1]));
    for (const p of list) {
      if (p.is_bot || !this.sockets.has(p.id)) continue;
      this.io.to(`p:${p.id}`).emit('me', this.playerState(p.id, ranks, list.length));
    }
  }

  // ----- exportación -----
  exportCsv(roomId: string): string {
    const questions = this.questionRows(roomId);
    const players = this.activePlayers(roomId);
    const answers = this.db.prepare('SELECT * FROM answers WHERE room_id = ?').all(roomId) as unknown as AnswerRow[];
    const byKey = new Map(answers.map((a) => [`${a.player_id}:${a.question_id}`, a]));
    const esc = (v: unknown) => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const head = [
      'Posición',
      'Jugador',
      'Equipo',
      ...questions.map((q) => `F${q.phase}-P${q.ord + 1}`),
      'Total',
      'Tiempo total (s)',
      'Bot',
    ];
    const lines = [head.map(esc).join(';')];
    players.forEach((p, i) => {
      const cells = questions.map((q) => {
        const a = byKey.get(`${p.id}:${q.id}`);
        return a && a.delta !== null ? a.delta + a.bonus : '';
      });
      lines.push(
        [i + 1, p.nickname, p.team ?? '', ...cells, p.balance, (p.total_response_ms / 1000).toFixed(1).replace('.', ','), p.is_bot ? 'Sí' : 'No']
          .map(esc)
          .join(';'),
      );
    });
    // BOM para que Excel (configuración regional es-CO) abra bien tildes y el separador ';'.
    return '﻿' + lines.join('\r\n');
  }
}

/** Barajado determinista (semilla = id de la pregunta) que evita mostrar el orden correcto. */
export function presentationOrder(items: string[], answer: string[], seedNum: number): string[] {
  let x = (seedNum * 2654435761) >>> 0 || 1;
  const rnd = () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  if (out.length > 1 && out.every((v, i) => v === answer[i])) out.push(out.shift()!);
  return out;
}

function fmtNum(n: number): string {
  const r = Math.abs(n) >= 100 ? Math.round(n) : Math.round(n * 10) / 10;
  return r.toLocaleString('es-CO');
}
