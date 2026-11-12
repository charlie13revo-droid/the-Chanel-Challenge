-- The Channel Challenge: esquema de base de datos (SQLite; compatible con Postgres con cambios menores).
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS rooms (
  id               TEXT PRIMARY KEY,
  code             TEXT NOT NULL UNIQUE,
  host_pin_hash    TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'lobby',      -- lobby | playing | finished
  current_phase    INTEGER NOT NULL DEFAULT 0,         -- 0 = aún no inicia
  current_question INTEGER NOT NULL DEFAULT 0,         -- índice dentro de la fase
  question_state   TEXT NOT NULL DEFAULT 'lobby',      -- lobby | phase_intro | ready | open | locked | revealed | leaderboard | phase_end | finished
  opened_at        INTEGER,
  closes_at        INTEGER,
  default_time     INTEGER NOT NULL DEFAULT 40,
  created_at       INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS phases (
  room_id    TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  phase_id   INTEGER NOT NULL,
  title      TEXT NOT NULL,
  multiplier REAL NOT NULL,
  color      TEXT NOT NULL,
  channels   TEXT NOT NULL DEFAULT '[]',               -- JSON
  drivers    TEXT NOT NULL DEFAULT '',
  phrase     TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (room_id, phase_id)
);

CREATE TABLE IF NOT EXISTS questions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id    TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  phase      INTEGER NOT NULL,
  ord        INTEGER NOT NULL,
  type       TEXT NOT NULL,                            -- mito_realidad | intruso | ranking | numeric
  prompt     TEXT NOT NULL,
  options    TEXT NOT NULL DEFAULT '[]',               -- JSON: opciones (intruso) o ítems (ranking)
  answer     TEXT NOT NULL,                            -- JSON
  unit       TEXT,
  min        REAL,
  max        REAL,
  step       REAL,
  reveal     TEXT NOT NULL DEFAULT '',
  host_note  TEXT NOT NULL DEFAULT '',
  multiplier REAL,                                     -- NULL = usa el de la fase
  time_limit INTEGER,                                  -- NULL = usa default_time de la sala
  UNIQUE (room_id, phase, ord)
);

CREATE TABLE IF NOT EXISTS players (
  id                TEXT PRIMARY KEY,
  room_id           TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  token             TEXT NOT NULL UNIQUE,
  nickname          TEXT NOT NULL,
  nickname_key      TEXT NOT NULL,                     -- apodo normalizado (unicidad sin tildes/mayúsculas)
  team              TEXT,
  balance           INTEGER NOT NULL DEFAULT 1000,
  total_response_ms INTEGER NOT NULL DEFAULT 0,
  connected         INTEGER NOT NULL DEFAULT 0,
  kicked            INTEGER NOT NULL DEFAULT 0,
  is_bot            INTEGER NOT NULL DEFAULT 0,
  prev_rank         INTEGER,
  rescued_phase     INTEGER,
  joined_at         INTEGER NOT NULL,
  UNIQUE (room_id, nickname_key)
);
CREATE INDEX IF NOT EXISTS players_room ON players(room_id);

CREATE TABLE IF NOT EXISTS answers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id     TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  player_id   TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  value       TEXT,                                    -- JSON; NULL = no respondió
  bet         INTEGER NOT NULL,
  answered_at INTEGER,
  response_ms INTEGER NOT NULL DEFAULT 0,
  is_correct  INTEGER,
  delta       INTEGER,
  bonus       INTEGER NOT NULL DEFAULT 0,
  UNIQUE (player_id, question_id)
);
CREATE INDEX IF NOT EXISTS answers_question ON answers(question_id);
