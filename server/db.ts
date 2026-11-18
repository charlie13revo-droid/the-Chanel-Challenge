import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export interface SeedQuestion {
  type: string;
  prompt: string;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  answer?: string | number;
  items?: string[];
  answerOrder?: string[];
  options?: string[];
  reveal: string;
  hostNote: string;
}
export interface SeedPhase {
  id: number;
  title: string;
  multiplier: number;
  color: string;
  channels: string[];
  drivers: string;
  phrase: string;
  timerSeconds?: number;
  showLeaderboardEachQuestion?: boolean;
  spendShare?: number | null;
  questions: SeedQuestion[];
}
export interface Seed {
  game: string;
  startingPoints: number;
  source: string;
  benchmark: string;
  phases: SeedPhase[];
}

export const seed: Seed = JSON.parse(readFileSync(join(here, '..', 'data', 'seed.json'), 'utf8'));

export function openDb(file = process.env.DB_FILE ?? join(here, '..', 'data', 'channel-challenge.db')): DatabaseSync {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');
  db.exec(readFileSync(join(here, 'schema.sql'), 'utf8'));
  // Migración para bases creadas con una versión anterior.
  const cols = db.prepare('PRAGMA table_info(rooms)').all() as { name: string }[];
  if (!cols.some((c) => c.name === 'auto_reveal')) db.exec('ALTER TABLE rooms ADD COLUMN auto_reveal INTEGER NOT NULL DEFAULT 1');
  const pcols = (db.prepare('PRAGMA table_info(phases)').all() as { name: string }[]).map((c) => c.name);
  if (!pcols.includes('timer_seconds')) db.exec('ALTER TABLE phases ADD COLUMN timer_seconds INTEGER');
  if (!pcols.includes('show_leaderboard')) db.exec('ALTER TABLE phases ADD COLUMN show_leaderboard INTEGER NOT NULL DEFAULT 1');
  if (!pcols.includes('spend_share')) db.exec('ALTER TABLE phases ADD COLUMN spend_share REAL');
  // Antes, 0 significaba "no ha iniciado"; ahora 0 es la Introducción. Las salas en lobby pasan a -1.
  db.exec("UPDATE rooms SET current_phase = -1 WHERE question_state = 'lobby'");
  return db;
}

/** Convierte una pregunta del JSON semilla a las columnas de la tabla `questions`. */
export function seedQuestionRow(q: SeedQuestion) {
  const options = q.type === 'ranking' ? q.items ?? [] : q.type === 'intruso' ? q.options ?? [] : [];
  const answer = q.type === 'ranking' ? q.answerOrder : q.answer;
  return {
    type: q.type,
    prompt: q.prompt,
    options: JSON.stringify(options),
    answer: JSON.stringify(answer),
    unit: q.unit ?? null,
    min: q.min ?? null,
    max: q.max ?? null,
    step: q.step ?? null,
    reveal: q.reveal,
    host_note: q.hostNote,
  };
}

/** Copia el banco semilla a una sala (el host puede editarlo antes del evento). */
export function loadBankIntoRoom(db: DatabaseSync, roomId: string) {
  db.prepare('DELETE FROM questions WHERE room_id = ?').run(roomId);
  db.prepare('DELETE FROM phases WHERE room_id = ?').run(roomId);
  const insPhase = db.prepare(
    'INSERT INTO phases (room_id, phase_id, title, multiplier, color, channels, drivers, phrase, timer_seconds, show_leaderboard, spend_share) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
  );
  const insQ = db.prepare(
    `INSERT INTO questions (room_id, phase, ord, type, prompt, options, answer, unit, min, max, step, reveal, host_note)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  for (const p of seed.phases) {
    insPhase.run(roomId, p.id, p.title, p.multiplier, p.color, JSON.stringify(p.channels), p.drivers, p.phrase,
      p.timerSeconds ?? null, p.showLeaderboardEachQuestion === false ? 0 : 1, p.spendShare ?? null);
    p.questions.forEach((q, i) => {
      const r = seedQuestionRow(q);
      insQ.run(roomId, p.id, i, r.type, r.prompt, r.options, r.answer, r.unit, r.min, r.max, r.step, r.reveal, r.host_note);
    });
  }
}
