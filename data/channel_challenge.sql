-- The Channel Challenge: esquema + banco de preguntas (generado con `npm run db:sql`).
-- El servidor crea las tablas automáticamente y copia este banco a cada sala nueva;
-- este script sirve para inspeccionar o cargar los datos manualmente (SQLite / Postgres).

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


-- Sala plantilla con el banco semilla (PIN no utilizable: hash vacío).
INSERT INTO rooms (id, code, host_pin_hash, created_at) VALUES ('template', 'TMPLT0', 'x:x', 0);
INSERT INTO phases (room_id, phase_id, title, multiplier, color, channels, drivers, phrase) VALUES ('template', 1, 'Si cuesta menos, mejor', 1, 'green', '["D1","Ísimo","Ara","Conveniencia"]', 'Ahorrar-Rendir + Shop Ability', 'El shopper resuelve sus necesidades cuidando al máximo el presupuesto');
INSERT INTO questions (room_id, phase, ord, type, prompt, options, answer, unit, min, max, step, reveal, host_note) VALUES ('template', 1, 0, 'numeric', '¿Qué % del gasto en consumo masivo se va a los canales de ''Si cuesta menos, mejor'' (D1, Ísimo, Ara, Conveniencia)?', '[]', '32', '%', 0, 60, 1, '32% del gasto FMCG. Es el cuadrante más grande del mercado.', 'Ahorrar-Rendir es la fuerza #1 del shopper (32% del valor).');
INSERT INTO questions (room_id, phase, ord, type, prompt, options, answer, unit, min, max, step, reveal, host_note) VALUES ('template', 1, 1, 'ranking', 'Ordena de MAYOR a MENOR frecuencia de compra al año', '["D1","Ara","Ísimo","Conveniencia"]', '["D1","Ara","Ísimo","Conveniencia"]', NULL, NULL, NULL, NULL, 'D1 46,6 veces · Ara 25,8 · Ísimo 4,5 · Conveniencia 3,3 (Total canales: 14,3).', 'D1 se visita más de 3 veces más que el promedio de canales.');
INSERT INTO questions (room_id, phase, ord, type, prompt, options, answer, unit, min, max, step, reveal, host_note) VALUES ('template', 1, 2, 'mito_realidad', 'En D1, más del 70% del valor que compra el shopper son marcas propias.', '[]', '"REALIDAD"', NULL, NULL, NULL, NULL, '73% del valor en D1 es marca propia vs. 20% en el total de canales. Solo 7% es Premium (vs. 23% total).', 'La propuesta de D1 es clara: resolver todo al menor precio.');
INSERT INTO questions (room_id, phase, ord, type, prompt, options, answer, unit, min, max, step, reveal, host_note) VALUES ('template', 1, 3, 'numeric', '¿Cuál es el precio medio por unidad de OREO dentro de D1? (COP)', '[]', '1182', 'COP', 500, 3000, 1, '$1.182 por unidad vs. $1.613 de las galletas dulces en D1. Ritz: $1.828 vs. $2.775 de las galletas saladas.', 'Para ganar en D1 hay que ofrecer economía: un mejor precio o un ticket que el hogar perciba como ahorro.');
INSERT INTO questions (room_id, phase, ord, type, prompt, options, answer, unit, min, max, step, reveal, host_note) VALUES ('template', 1, 4, 'intruso', '¿Cuál de estos canales es el INTRUSO, es decir, NO pertenece a ''Si cuesta menos, mejor''?', '["D1","Ara","Ísimo","Dollarcity"]', '"Dollarcity"', NULL, NULL, NULL, NULL, 'Dollarcity pertenece a ''A la vuelta de la esquina''. Bonus: Conveniencia sí está aquí y tiene el NPS más bajo de todos los canales (−23%).', 'Conveniencia reemplaza al Discounter cuando no está disponible: compra de antojo, en horarios amplios (index 2,6).');
INSERT INTO phases (room_id, phase_id, title, multiplier, color, channels, drivers, phrase) VALUES ('template', 2, 'En busca de la mejor oportunidad', 1.25, 'purple', '["Olímpica","Éxito","Jumbo","Cadenas Independientes"]', 'Shop Ability + Exploración', 'Llena el carrito, pero elige el canal por la oportunidad: puntos, promociones y degustaciones');
INSERT INTO questions (room_id, phase, ord, type, prompt, options, answer, unit, min, max, step, reveal, host_note) VALUES ('template', 2, 0, 'numeric', '¿Qué % del gasto FMCG concentran Olímpica, Éxito, Jumbo y las Cadenas Independientes?', '[]', '23', '%', 0, 60, 1, '23% del gasto FMCG.', 'Aquí el shopper elige el canal por la oportunidad, no por el precio.');
INSERT INTO questions (room_id, phase, ord, type, prompt, options, answer, unit, min, max, step, reveal, host_note) VALUES ('template', 2, 1, 'mito_realidad', 'En Olímpica, la gente compra principalmente porque tiene los precios más bajos.', '[]', '"MITO"', NULL, NULL, NULL, NULL, 'La motivación #1 es el programa de puntos y descuentos (index 1,6), seguida de los volantes (1,4). De hecho, el principal motivo para ser detractor son los precios altos (37%).', 'El ''me dejo guiar por las ofertas'' sobreindexa 1,53 en Olímpica.');
INSERT INTO questions (room_id, phase, ord, type, prompt, options, answer, unit, min, max, step, reveal, host_note) VALUES ('template', 2, 2, 'ranking', 'Ordena de MAYOR a MENOR ticket promedio por compra', '["Olímpica","Éxito","Jumbo","Cadenas Independientes"]', '["Jumbo","Éxito","Cadenas Independientes","Olímpica"]', NULL, NULL, NULL, NULL, 'Jumbo $60.980 · Éxito $48.172 · Independientes $47.395 · Olímpica $42.461 (Total: $36.959).', 'Jumbo: ticket alto pero solo 4,9 visitas al año. Independientes: 24,4 visitas.');
INSERT INTO questions (room_id, phase, ord, type, prompt, options, answer, unit, min, max, step, reveal, host_note) VALUES ('template', 2, 3, 'numeric', '¿Qué % del valor de Olímpica viene de la región Atlántico?', '[]', '55', '%', 0, 100, 1, '55% del valor, con un índice de 370 vs. el total de canales. Su shopper: Consuelo, 58 años, Atlántico, NSE 3.', 'Bogotá solo pesa 25% en Olímpica (índice 75).');
INSERT INTO questions (room_id, phase, ord, type, prompt, options, answer, unit, min, max, step, reveal, host_note) VALUES ('template', 2, 4, 'intruso', '¿Cuál NO está en el top 5 de motivaciones de compra de Éxito?', '["Encuentro más que productos de canasta básica","Encontramos los últimos lanzamientos","Tiene buen programa de puntos y descuentos","Ofrece los precios más bajos del mercado"]', '"Ofrece los precios más bajos del mercado"', NULL, NULL, NULL, NULL, 'Top de Éxito: más que canasta básica (1,5), lanzamientos (1,4), puntos (1,3), seguridad (1,3), degustaciones (1,3). El 81% de sus detractores lo son por precios altos.', 'Éxito es un canal de descubrimiento: hay que usarlo para impulsar innovaciones.');
INSERT INTO phases (room_id, phase_id, title, multiplier, color, channels, drivers, phrase) VALUES ('template', 3, 'Más opciones, más posibilidades', 1.5, 'orange', '["Droguerías de Cadena","Hiperbodegas","Carulla"]', 'Confianza + Exploración', 'Entra por variedad, novedad y experiencia, no por resolver la despensa');
INSERT INTO questions (room_id, phase, ord, type, prompt, options, answer, unit, min, max, step, reveal, host_note) VALUES ('template', 3, 0, 'numeric', '¿Qué % del gasto FMCG concentran Droguerías de Cadena, Hiperbodegas y Carulla?', '[]', '6', '%', 0, 60, 1, 'Solo 6% del gasto: el cuadrante más pequeño, pero el de mayor valor por visita.', 'Pocos pesos, pero un shopper que explora y paga más.');
INSERT INTO questions (room_id, phase, ord, type, prompt, options, answer, unit, min, max, step, reveal, host_note) VALUES ('template', 3, 1, 'numeric', '¿Cuál es el ticket promedio por compra en Hiperbodegas? (COP)', '[]', '72635', 'COP', 20000, 150000, 1, '$72.635: el ticket más alto del mercado, con 8,6 unidades por acto (Total: $36.959 y 5,3 unidades).', 'Una salida planeada de alto volumen: básicos en tamaños grandes.');
INSERT INTO questions (room_id, phase, ord, type, prompt, options, answer, unit, min, max, step, reveal, host_note) VALUES ('template', 3, 2, 'mito_realidad', 'Carulla es un canal donde se hace la compra grande del mes.', '[]', '"MITO"', NULL, NULL, NULL, NULL, 'Carulla se comporta como un canal de reposición (49% del valor) y de antojo: ''voy a ver qué se me antoja'' sobreindexa 1,62. 50% de su valor es Premium.', 'Su shopper: Isabel, 60 años, NSE 5-6 (índice 629).');
INSERT INTO questions (room_id, phase, ord, type, prompt, options, answer, unit, min, max, step, reveal, host_note) VALUES ('template', 3, 3, 'ranking', 'Ordena de MAYOR a MENOR NPS (recomendación)', '["Carulla","Hiperbodegas","Droguerías de Cadena"]', '["Hiperbodegas","Droguerías de Cadena","Carulla"]', NULL, NULL, NULL, NULL, 'Hiperbodegas 42% (2° puesto) · Droguerías de Cadena 32% (7°) · Carulla 5% (14°). El 84% de los detractores de Carulla lo son por precios altos.', 'Hiperbodegas: el precio y la lejanía limitan su alcance, pero fideliza fuerte a quien ya compra.');
INSERT INTO questions (room_id, phase, ord, type, prompt, options, answer, unit, min, max, step, reveal, host_note) VALUES ('template', 3, 4, 'intruso', 'En 3 de estos canales, Premium es el tier con más peso en valor. ¿Cuál es el intruso?', '["Droguerías de Cadena","Carulla","Jumbo","Hiperbodegas"]', '"Hiperbodegas"', NULL, NULL, NULL, NULL, 'Premium: Droguerías de Cadena 62%, Carulla 50%, Jumbo 48%. En Hiperbodegas lidera Mainstream (39%) sobre Premium (34%).', 'Droguerías de Cadena: domicilio con índice 4,9 (490%), es la motivación #1.');
INSERT INTO phases (room_id, phase_id, title, multiplier, color, channels, drivers, phrase) VALUES ('template', 4, 'A la vuelta de la esquina', 2, 'blue', '["Tienda de Barrio","Minimercados","Dollarcity","Droguerías de Barrio"]', 'Confianza + Ahorrar-Rendir', 'Se compra poco, muchas veces y sin desplazarse');
INSERT INTO questions (room_id, phase, ord, type, prompt, options, answer, unit, min, max, step, reveal, host_note) VALUES ('template', 4, 0, 'numeric', '¿Qué % del gasto FMCG concentran Tienda de Barrio, Minimercados, Dollarcity y Droguerías de Barrio?', '[]', '26', '%', 0, 60, 1, '26% del gasto FMCG.', 'El ticket y la cercanía son lo más importante.');
INSERT INTO questions (room_id, phase, ord, type, prompt, options, answer, unit, min, max, step, reveal, host_note) VALUES ('template', 4, 1, 'numeric', '¿Cuántas veces al año compra un hogar en la Tienda de Barrio?', '[]', '57.2', 'veces', 0, 120, 0.1, '57,2 veces al año: la frecuencia más alta del mercado, con un ticket de $21.983.', 'Su shopper: Rosa, 40 años, Atlántico, NSE 1-2, hogar numeroso.');
INSERT INTO questions (room_id, phase, ord, type, prompt, options, answer, unit, min, max, step, reveal, host_note) VALUES ('template', 4, 2, 'mito_realidad', 'La gente va a la Tienda de Barrio porque tiene los precios más bajos.', '[]', '"MITO"', NULL, NULL, NULL, NULL, 'Gana por domicilio (index 2,9) y cercanía (2,4). El precio es el principal motivo de detractor (65%). Y no es compra impulsiva: ''llevo una lista'' sobreindexa 1,23.', 'La conveniencia económica de la tienda es facilidad de acceso, no precio bajo.');
INSERT INTO questions (room_id, phase, ord, type, prompt, options, answer, unit, min, max, step, reveal, host_note) VALUES ('template', 4, 3, 'ranking', 'Ordena de MAYOR a MENOR ticket promedio por compra', '["Tienda de Barrio","Minimercados","Dollarcity","Droguerías de Barrio"]', '["Minimercados","Droguerías de Barrio","Tienda de Barrio","Dollarcity"]', NULL, NULL, NULL, NULL, 'Minimercados $38.268 · Droguerías de Barrio $28.581 · Tienda $21.983 · Dollarcity $18.106.', 'Minimercados resuelve cualquier necesidad, grande o pequeña: 34,9 visitas al año y 6,5 unidades.');
INSERT INTO questions (room_id, phase, ord, type, prompt, options, answer, unit, min, max, step, reveal, host_note) VALUES ('template', 4, 4, 'intruso', 'En 3 de estos canales, ''ofrece servicio a domicilio'' es la motivación #1. ¿Cuál es el intruso?', '["Tienda de Barrio","Minimercados","Droguerías de Barrio","Dollarcity"]', '"Dollarcity"', NULL, NULL, NULL, NULL, 'Domicilio #1: Droguerías de Barrio 3,6 · Tienda 2,9 · Minimercados 1,7. En Dollarcity la #1 son los productos importados (index 4,2), y es el 3er canal en NPS (40%).', 'Dollarcity sirve como canal de prueba para lanzamientos importados y de temporada.');
INSERT INTO phases (room_id, phase_id, title, multiplier, color, channels, drivers, phrase) VALUES ('template', 5, 'PREGUNTA DE ORO', 3, 'gold', '[]', '', 'Una sola pregunta, multiplicador x3. Es el momento de arriesgar.');
INSERT INTO questions (room_id, phase, ord, type, prompt, options, answer, unit, min, max, step, reveal, host_note) VALUES ('template', 5, 0, 'numeric', '¿Cuántos canales distintos visita en promedio un hogar colombiano al año para su consumo masivo?', '[]', '9.4', 'canales', 1, 20, 0.1, '9,4 canales (MAT Jun-26), vs. 8,8 en Jun-23. No existe un canal perfecto: cada uno cumple un rol distinto.', 'Cierre: la pregunta no es dónde compra el shopper, sino qué rol le da a cada canal.');
