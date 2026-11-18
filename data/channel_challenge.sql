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
  current_phase    INTEGER NOT NULL DEFAULT -1,        -- -1 = aún no inicia (0 = Introducción)
  current_question INTEGER NOT NULL DEFAULT 0,         -- índice dentro de la fase
  question_state   TEXT NOT NULL DEFAULT 'lobby',      -- lobby | howto | phase_intro | ready | open | locked | revealed | leaderboard | phase_end | finished
  opened_at        INTEGER,
  closes_at        INTEGER,
  default_time     INTEGER NOT NULL DEFAULT 40,
  auto_reveal      INTEGER NOT NULL DEFAULT 1,       -- 1 = revela solo al cerrar y cierra cuando todos respondieron
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
  timer_seconds    INTEGER,                         -- NULL = usa default_time de la sala
  show_leaderboard INTEGER NOT NULL DEFAULT 1,      -- Top 10 después de cada pregunta
  spend_share      REAL,                            -- % del gasto FMCG del capítulo
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
INSERT INTO rooms (id, code, host_pin_hash, current_phase, created_at) VALUES ('template', 'TMPLT0', 'x:x', -1, 0);
INSERT INTO phases (room_id, phase_id, title, multiplier, color, channels, drivers, phrase, timer_seconds, show_leaderboard, spend_share) VALUES ('template', 0, 'Introducción: ¿Qué tanto conoces al shopper?', 1, 'teal', '[]', '', 'Cuando el shopper visita todos los canales, la gran pregunta es: ¿qué rol le está dando a cada uno?', 20, 0, NULL);
INSERT INTO questions (room_id, phase, ord, type, prompt, options, answer, unit, min, max, step, reveal, host_note) VALUES ('template', 0, 0, 'mito_realidad', 'El shopper colombiano es fiel a un solo canal para hacer su compra de consumo masivo.', '[]', '"MITO"', NULL, NULL, NULL, NULL, 'El shopper compra en todos los canales. Lo que hay que entender es qué rol le da a cada uno.', 'Puente a la slide 9: cuando el shopper visita todos los canales, ¿qué rol le está dando a cada uno?');
INSERT INTO questions (room_id, phase, ord, type, prompt, options, answer, unit, min, max, step, reveal, host_note) VALUES ('template', 0, 1, 'numeric', '¿Cuántas fuerzas mueven la elección de canal del shopper?', '[]', '4', 'fuerzas', 1, 10, 1, '4 fuerzas: Ahorrar-Rendir, Confianza, Disponibilidad-Promociones y Portafolio.', 'Puente a la slide 12: cada fuerza agrupa los atributos que el shopper valora del canal.');
INSERT INTO questions (room_id, phase, ord, type, prompt, options, answer, unit, min, max, step, reveal, host_note) VALUES ('template', 0, 2, 'intruso', '¿Cuál de estas NO es una de las fuerzas que busca el shopper?', '["Ahorrar-Rendir","Confianza","Portafolio","Lealtad a la marca"]', '"Lealtad a la marca"', NULL, NULL, NULL, NULL, 'La cuarta fuerza es Disponibilidad-Promociones: compra eficiente y rápida, horarios amplios y promociones claras.', 'Las 4 fuerzas: Ahorrar-Rendir, Confianza, Disponibilidad-Promociones y Portafolio.');
INSERT INTO questions (room_id, phase, ord, type, prompt, options, answer, unit, min, max, step, reveal, host_note) VALUES ('template', 0, 3, 'ranking', 'Ordena de MAYOR a MENOR las fuerzas según el % del valor que mueven', '["Confianza","Portafolio","Ahorrar-Rendir","Disponibilidad-Promociones"]', '["Ahorrar-Rendir","Confianza","Disponibilidad-Promociones","Portafolio"]', NULL, NULL, NULL, NULL, 'Ahorrar-Rendir 32% · Confianza 26% · Disponibilidad-Promociones 24% · Portafolio 18% (share valor, MAT Mar-26).', 'Ahorro y confianza son la base; disponibilidad y portafolio agregan nuevas oportunidades.');
INSERT INTO questions (room_id, phase, ord, type, prompt, options, answer, unit, min, max, step, reveal, host_note) VALUES ('template', 0, 4, 'numeric', '¿Qué % del valor de consumo masivo mueve la fuerza Portafolio (variedad y descubrimiento)?', '[]', '18', '%', 0, 60, 1, '18% del valor y de las unidades: es la fuerza más pequeña, pero la que abre nuevas oportunidades.', 'Portafolio: descubrir productos, marcas y categorías nuevas.');
INSERT INTO questions (room_id, phase, ord, type, prompt, options, answer, unit, min, max, step, reveal, host_note) VALUES ('template', 0, 5, 'intruso', '¿Cuál de estos atributos NO pertenece a la fuerza Confianza?', '["Que ofrezca marcas reconocidas","Que tenga productos frescos y refrigerados","Que sea un lugar seguro para comprar","Que ofrezca servicio de entrega a domicilio"]', '"Que ofrezca servicio de entrega a domicilio"', NULL, NULL, NULL, NULL, 'El domicilio pertenece a Disponibilidad-Promociones. La Confianza se construye con el buen estado de los productos, la seguridad y la atención.', 'Puente a la slide 12: los atributos que componen cada una de las 4 fuerzas.');
INSERT INTO questions (room_id, phase, ord, type, prompt, options, answer, unit, min, max, step, reveal, host_note) VALUES ('template', 0, 6, 'mito_realidad', 'Para el shopper, que el canal esté cerca de su casa no tiene nada que ver con ahorrar.', '[]', '"MITO"', NULL, NULL, NULL, NULL, '''Está cerca de nuestro hogar o ruta habitual'' es un atributo de Ahorrar-Rendir: maximizar el presupuesto combinando precios bajos con cercanía y rapidez.', 'Conecta con el capítulo ''A la vuelta de la esquina''.');
INSERT INTO questions (room_id, phase, ord, type, prompt, options, answer, unit, min, max, step, reveal, host_note) VALUES ('template', 0, 7, 'intruso', 'En el mapa de canales, ¿qué fuerza está en el extremo opuesto a Ahorrar-Rendir?', '["Confianza","Shop Ability","Exploración","Disponibilidad"]', '"Exploración"', NULL, NULL, NULL, NULL, 'Eje horizontal: Ahorrar-Rendir ↔ Exploración. Eje vertical: Confianza ↔ Shop Ability.', 'Puente a la slide 14: entrada al plano cartesiano. En el mapa, Portafolio aparece como Exploración y Disponibilidad-Promociones como Shop Ability.');
INSERT INTO questions (room_id, phase, ord, type, prompt, options, answer, unit, min, max, step, reveal, host_note) VALUES ('template', 0, 8, 'mito_realidad', 'El rol de un canal lo define una sola fuerza.', '[]', '"MITO"', NULL, NULL, NULL, NULL, 'Cada canal se ubica cruzando dos ejes: su rol es la combinación de dos fuerzas. Así nacen los 4 capítulos.', 'Ningún canal vive de una sola fuerza.');
INSERT INTO questions (room_id, phase, ord, type, prompt, options, answer, unit, min, max, step, reveal, host_note) VALUES ('template', 0, 9, 'intruso', '¿Qué dos fuerzas le dan su rol a D1?', '["Ahorrar-Rendir + Shop Ability","Confianza + Exploración","Confianza + Ahorrar-Rendir","Shop Ability + Exploración"]', '"Ahorrar-Rendir + Shop Ability"', NULL, NULL, NULL, NULL, 'D1 está en ''Si cuesta menos, mejor''. Las otras combinaciones son: Confianza + Exploración = Más opciones, más posibilidades; Confianza + Ahorrar-Rendir = A la vuelta de la esquina; Shop Ability + Exploración = En busca de la mejor oportunidad.', 'Úsala para presentar los 4 cuadrantes del mapa.');
INSERT INTO phases (room_id, phase_id, title, multiplier, color, channels, drivers, phrase, timer_seconds, show_leaderboard, spend_share) VALUES ('template', 1, 'Si cuesta menos, mejor', 1, 'green', '["D1","Ísimo","Ara","Conveniencia"]', 'Ahorrar-Rendir + Shop Ability', 'El shopper resuelve sus necesidades cuidando al máximo el presupuesto', 30, 1, 32);
INSERT INTO questions (room_id, phase, ord, type, prompt, options, answer, unit, min, max, step, reveal, host_note) VALUES ('template', 1, 0, 'mito_realidad', 'En D1 el shopper compra por impulso, sin planear lo que va a llevar.', '[]', '"MITO"', NULL, NULL, NULL, NULL, 'D1 ocupa el 1er puesto en planeación entre todos los canales: llevar una lista y hacer la compra grande del mes pesan más que en el promedio. Es el canal de la despensa: resolver todo al menor precio.', 'Puente a las slides 16 y 17. Su shopper: Claudia, 42 años, Antioquia, NSE 3, hogar de 1 a 2 personas.');
INSERT INTO questions (room_id, phase, ord, type, prompt, options, answer, unit, min, max, step, reveal, host_note) VALUES ('template', 1, 1, 'ranking', 'Ordena de MAYOR a MENOR NPS (recomendación)', '["Conveniencia","Ísimo","D1","Ara"]', '["D1","Ara","Ísimo","Conveniencia"]', NULL, NULL, NULL, NULL, 'D1 46% (1er puesto de todos los canales) · Ara 35% (6°) · Ísimo 9% (13°) · Conveniencia −23% (el NPS más bajo de todos).', 'Los cuatro juegan con precio, pero la satisfacción es muy distinta: no basta con ser barato, hay que cumplir el rol. Ísimo se busca por economía pero se usa de forma ocasional (slide 19); Ara suma precio + volantes (slide 20).');
INSERT INTO questions (room_id, phase, ord, type, prompt, options, answer, unit, min, max, step, reveal, host_note) VALUES ('template', 1, 2, 'numeric', '¿Cuál es el precio medio por unidad de OREO dentro de D1? (COP)', '[]', '1182', 'COP', 500, 3000, 1, '$1.182 por unidad vs. $1.613 de las galletas dulces en D1. Ritz: $1.828 vs. $2.775 de las galletas saladas.', 'Puente a la slide 18: para ganar en D1 hay que ofrecer economía, con un mejor precio o un ticket que el hogar perciba como ahorro.');
INSERT INTO questions (room_id, phase, ord, type, prompt, options, answer, unit, min, max, step, reveal, host_note) VALUES ('template', 1, 3, 'intruso', 'Conveniencia reemplaza al Discounter cuando este no está disponible. ¿Qué motivación sobreindexa MÁS en este canal?', '["Que tenga horarios de atención amplios","Ofrece los precios más bajos del mercado","Que tenga volantes o revistas de promociones","Que tenga gran variedad de marcas"]', '"Que tenga horarios de atención amplios"', NULL, NULL, NULL, NULL, 'Horarios amplios: index 260%. Le sigue ''es fácil encontrar promociones destacadas en exhibición'' (140%). Es la compra económica e impulsiva para una necesidad puntual.', 'Puente a la slide 21: activar descuentos en galletas y chocolates de 10 pm a 7 am, cuando los Discounters (8 am a 9 pm) están cerrados, y complementar con publicidad el día anterior.');
INSERT INTO phases (room_id, phase_id, title, multiplier, color, channels, drivers, phrase, timer_seconds, show_leaderboard, spend_share) VALUES ('template', 2, 'En busca de la mejor oportunidad', 1.25, 'purple', '["Olímpica","Éxito","Jumbo","Cadenas Independientes"]', 'Shop Ability + Exploración', 'Llena el carrito, pero elige el canal por la oportunidad: puntos, promociones y degustaciones', 30, 1, 23);
INSERT INTO questions (room_id, phase, ord, type, prompt, options, answer, unit, min, max, step, reveal, host_note) VALUES ('template', 2, 0, 'mito_realidad', 'En Olímpica, la gente compra principalmente porque tiene los precios más bajos.', '[]', '"MITO"', NULL, NULL, NULL, NULL, 'La motivación #1 es el programa de puntos y descuentos (index 1,6), seguida de los volantes (1,4). De hecho, el principal motivo para ser detractor son los precios altos (37%).', 'Puente a la slide 24: hacer de los puntos un acelerador, con comunicación clara, y ganar visibilidad en los volantes. ''Me dejo guiar por las ofertas'' sobreindexa 1,53.');
INSERT INTO questions (room_id, phase, ord, type, prompt, options, answer, unit, min, max, step, reveal, host_note) VALUES ('template', 2, 1, 'intruso', '¿Cuál NO está en el top 5 de motivaciones de compra de Éxito?', '["Encuentro más que productos de canasta básica","Encontramos los últimos lanzamientos","Tiene buen programa de puntos y descuentos","Ofrece los precios más bajos del mercado"]', '"Ofrece los precios más bajos del mercado"', NULL, NULL, NULL, NULL, 'Top de Éxito: más que canasta básica (1,5), lanzamientos (1,4), puntos (1,3), seguridad (1,3), degustaciones (1,3). El 81% de sus detractores lo son por precios altos.', 'Puente a la slide 25: Éxito es un canal de descubrimiento. Ahí deben vivir las innovaciones, los nuevos sabores y las ediciones especiales.');
INSERT INTO questions (room_id, phase, ord, type, prompt, options, answer, unit, min, max, step, reveal, host_note) VALUES ('template', 2, 2, 'intruso', '¿Qué palanca hace que el shopper explore en Jumbo?', '["Ofrece degustaciones o prueba de productos","Ofrece los precios más bajos del mercado","Que tenga horarios de atención amplios","Está cerca de nuestro hogar o ruta habitual"]', '"Ofrece degustaciones o prueba de productos"', NULL, NULL, NULL, NULL, 'Degustaciones: index 138%. Y el 33% de sus compradores ''nunca lleva algo en mente: va a revisar qué se le antoja''.', 'Puente a la slide 26: degustaciones en momentos de alto tráfico que refuercen recetas y momentos de consumo (Oreo con helado, cheesecake de Oreo, Ritz con toppings).');
INSERT INTO questions (room_id, phase, ord, type, prompt, options, answer, unit, min, max, step, reveal, host_note) VALUES ('template', 2, 3, 'mito_realidad', 'Las Cadenas Independientes son el canal con más variedad de formatos de galletas.', '[]', '"MITO"', NULL, NULL, NULL, NULL, 'El shopper sí busca aquí variedad de empaques y tamaños (index 140%), pero Independientes es apenas el 4° canal con más formatos de galletas. Ahí hay una oportunidad.', 'Puente a la slide 27: adaptar formatos y sabores al ticket y asegurar una propuesta completa en la góndola de lonchera grande.');
INSERT INTO phases (room_id, phase_id, title, multiplier, color, channels, drivers, phrase, timer_seconds, show_leaderboard, spend_share) VALUES ('template', 3, 'Más opciones, más posibilidades', 1.5, 'orange', '["Droguerías de Cadena","Hiperbodegas","Carulla"]', 'Confianza + Exploración', 'Entra por variedad, novedad y experiencia, no por resolver la despensa', 30, 1, 6);
INSERT INTO questions (room_id, phase, ord, type, prompt, options, answer, unit, min, max, step, reveal, host_note) VALUES ('template', 3, 0, 'intruso', 'En Droguerías de Cadena hay una motivación que sobreindexa 490%. ¿Cuál es?', '["Ofrece servicio de entrega a domicilio","Ofrece los precios más bajos del mercado","Que tenga parqueadero","Que tenga gran cantidad de productos importados"]', '"Ofrece servicio de entrega a domicilio"', NULL, NULL, NULL, NULL, 'Domicilio: index 490%, la motivación #1. Y el 50% de sus compradores va por un producto específico.', 'Puente a la slide 30: mostrar que nuestras marcas están en el canal, en la app y en la sección ''No olvides llevar'' (ya estamos impulsando OREO en la app).');
INSERT INTO questions (room_id, phase, ord, type, prompt, options, answer, unit, min, max, step, reveal, host_note) VALUES ('template', 3, 1, 'numeric', '¿Cuál es el ticket promedio por compra en Hiperbodegas? (COP)', '[]', '72635', 'COP', 20000, 150000, 1, '$72.635: el ticket más alto del mercado, con 8,6 unidades por acto (Total: $36.959 y 5,3 unidades).', 'Puente a la slide 29: una salida planeada de alto volumen, con básicos en tamaños grandes.');
INSERT INTO questions (room_id, phase, ord, type, prompt, options, answer, unit, min, max, step, reveal, host_note) VALUES ('template', 3, 2, 'ranking', 'Ordena de MAYOR a MENOR NPS (recomendación)', '["Carulla","Hiperbodegas","Droguerías de Cadena"]', '["Hiperbodegas","Droguerías de Cadena","Carulla"]', NULL, NULL, NULL, NULL, 'Hiperbodegas 42% (2° puesto) · Droguerías de Cadena 32% (7°) · Carulla 5% (14°). El 84% de los detractores de Carulla lo son por precios altos.', 'Puente a la slide 31: el precio y la lejanía limitan el alcance de Hiperbodegas, pero fideliza fuerte a quien ya compra.');
INSERT INTO questions (room_id, phase, ord, type, prompt, options, answer, unit, min, max, step, reveal, host_note) VALUES ('template', 3, 3, 'mito_realidad', 'Carulla es un canal donde se hace la compra grande del mes.', '[]', '"MITO"', NULL, NULL, NULL, NULL, 'Carulla se comporta como un canal de reposición (49% del valor) y de antojo: ''voy a ver qué se me antoja'' sobreindexa 1,62. 50% de su valor es Premium.', 'Puente a la slide 32: exhibiciones de ocasión fuera de góndola, en línea con ''Pequeños placeres, grandes momentos''. Su shopper: Isabel, 60 años, NSE 5-6 (índice 629).');
INSERT INTO phases (room_id, phase_id, title, multiplier, color, channels, drivers, phrase, timer_seconds, show_leaderboard, spend_share) VALUES ('template', 4, 'A la vuelta de la esquina', 2, 'blue', '["Tienda de Barrio","Minimercados","Dollarcity","Droguerías de Barrio"]', 'Confianza + Ahorrar-Rendir', 'Se compra poco, muchas veces y sin desplazarse', 30, 1, 26);
INSERT INTO questions (room_id, phase, ord, type, prompt, options, answer, unit, min, max, step, reveal, host_note) VALUES ('template', 4, 0, 'numeric', '¿Cuántas veces al año compra un hogar en la Tienda de Barrio?', '[]', '57.2', 'veces', 0, 120, 0.1, '57,2 veces al año: la frecuencia más alta del mercado, con un ticket de $21.983.', 'Puente a la slide 34. Su shopper: Rosa, 40 años, Atlántico, NSE 1-2, hogar numeroso.');
INSERT INTO questions (room_id, phase, ord, type, prompt, options, answer, unit, min, max, step, reveal, host_note) VALUES ('template', 4, 1, 'mito_realidad', 'La gente va a la Tienda de Barrio porque tiene los precios más bajos.', '[]', '"MITO"', NULL, NULL, NULL, NULL, 'Gana por domicilio (index 2,9) y cercanía (2,4). El precio es el principal motivo de detractor (65%). Y no es compra impulsiva: ''llevo una lista'' sobreindexa 1,23.', 'Puente a la slide 35: la conveniencia de la tienda es la facilidad de acceso, no el precio bajo. Usar la cercanía para impulsar la recomendación del tendero, con un plan de puntos.');
INSERT INTO questions (room_id, phase, ord, type, prompt, options, answer, unit, min, max, step, reveal, host_note) VALUES ('template', 4, 2, 'intruso', 'En 3 de estos canales, ''ofrece servicio a domicilio'' es la motivación #1. ¿Cuál es el intruso?', '["Tienda de Barrio","Minimercados","Droguerías de Barrio","Dollarcity"]', '"Dollarcity"', NULL, NULL, NULL, NULL, 'Domicilio #1: Droguerías de Barrio 3,6 · Tienda 2,9 · Minimercados 1,7. En Dollarcity la #1 son los productos importados (index 4,2), y es el 3er canal en NPS (40%).', 'Puente a la slide 37: Dollarcity sirve como canal de prueba para lanzamientos importados y de temporada (Oreo Red Velvet, S''Moreo, calendario de Adviento).');
INSERT INTO questions (room_id, phase, ord, type, prompt, options, answer, unit, min, max, step, reveal, host_note) VALUES ('template', 4, 3, 'intruso', 'En Droguerías de Barrio, ¿dónde tiene más sentido impulsar nuestras marcas?', '["En el punto de pago, con ristras de productos individuales","Con degustaciones en momentos de alto tráfico","Con volantes y revistas de promociones","En la góndola de lonchera grande"]', '"En el punto de pago, con ristras de productos individuales"', NULL, NULL, NULL, NULL, 'Es un canal de confianza y cercanía: ''hay alguien dispuesto a ayudar'' sobreindexa 240% y el domicilio 360%. La compra es corta (2,3 unidades por acto), así que el momento clave es el punto de pago.', 'Puente a la slide 38.');
INSERT INTO phases (room_id, phase_id, title, multiplier, color, channels, drivers, phrase, timer_seconds, show_leaderboard, spend_share) VALUES ('template', 5, 'PREGUNTA DE ORO', 3, 'gold', '[]', '', 'Una sola pregunta, multiplicador x3. Es el momento de arriesgar.', 40, 0, NULL);
INSERT INTO questions (room_id, phase, ord, type, prompt, options, answer, unit, min, max, step, reveal, host_note) VALUES ('template', 5, 0, 'numeric', '¿Cuántos canales distintos visita en promedio un hogar colombiano al año para su consumo masivo?', '[]', '9.4', 'canales', 1, 20, 0.1, '9,4 canales (MAT Jun-26), vs. 8,8 en Jun-23. No existe un canal perfecto: cada uno cumple un rol distinto.', 'Cierre (slide 39): la pregunta no es dónde compra el shopper, sino qué rol le da a cada canal. Después, podio final.');
