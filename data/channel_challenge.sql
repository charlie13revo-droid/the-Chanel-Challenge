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
INSERT INTO questions (room_id, phase, ord, type, prompt, options, answer, unit, min, max, step, reveal, host_note) VALUES ('template', 0, 0, 'intruso', 'Cada región del mundo tiene su forma de comprar. ¿Cuál describe mejor a Latinoamérica?', '["Maneja hasta el supermercado grande","Va al discounter","Compra por internet","Camina a la tienda de la esquina"]', '"Camina a la tienda de la esquina"', NULL, NULL, NULL, NULL, 'El 37% del valor FMCG en Latam pasa por la tienda tradicional y solo el 24% por súper/hiper. Norteamérica maneja al súper (51%), Europa Occidental va al discounter (26%) y Asia hace clic (31% e-commerce).', 'Lánzala en la portada de la intro; se revela en la intro, slide 2.');
INSERT INTO questions (room_id, phase, ord, type, prompt, options, answer, unit, min, max, step, reveal, host_note) VALUES ('template', 0, 1, 'numeric', 'De cada $100 que el hogar gasta en consumo masivo, ¿cuántos se van al Discounter en Colombia?', '[]', '25', '$ de cada $100', 0, 60, 1, '$25 de cada $100: el 25% del gasto FMCG, casi el mismo share que en Europa Occidental (26%). El otro 75% sigue en los demás canales.', 'Lánzala junto con la anterior; se revela en la intro, slide 2 (Colombia se parece a Europa). En la slide 10 se explica cómo llegó el Discounter ahí.');
INSERT INTO questions (room_id, phase, ord, type, prompt, options, answer, unit, min, max, step, reveal, host_note) VALUES ('template', 0, 2, 'mito_realidad', 'El shopper es fiel a un solo canal para hacer su mercado.', '[]', '"MITO"', NULL, NULL, NULL, NULL, 'En Latam un hogar compra su consumo masivo en 11,2 canales distintos al año, y el 63% visita 8 o más. ¿El dato de Colombia? Lo revelamos en la Pregunta de Oro.', 'Se revela en la intro, slide 3. No reveles el dato de Colombia: es la Pregunta de Oro.');
INSERT INTO questions (room_id, phase, ord, type, prompt, options, answer, unit, min, max, step, reveal, host_note) VALUES ('template', 0, 3, 'intruso', '¿Qué país de Latinoamérica crece más en unidades de consumo masivo este año?', '["Brasil","México","Colombia","Chile"]', '"Colombia"', NULL, NULL, NULL, NULL, 'Colombia +3,2% vs +0,7% de Latam. México +1,9%, Brasil +0,1% y Chile −0,7%.', 'Se revela en la intro, slide 4.');
INSERT INTO questions (room_id, phase, ord, type, prompt, options, answer, unit, min, max, step, reveal, host_note) VALUES ('template', 0, 4, 'mito_realidad', 'Quien empieza a comprar en el Discounter deja de comprar en los demás canales.', '[]', '"MITO"', NULL, NULL, NULL, NULL, 'El 55% de los hogares que compran toallas de cocina en el Discounter también las compran en otros canales (yogur griego: 42%). Fuera del Discounter el valor también crece (+2,0%).', 'Se revela en la intro, slide 11.');
INSERT INTO questions (room_id, phase, ord, type, prompt, options, answer, unit, min, max, step, reveal, host_note) VALUES ('template', 0, 5, 'intruso', 'Frente a la góndola, ¿qué mira primero el shopper la mayoría de las veces?', '["La marca","El precio","El tamaño","El sabor"]', '"La marca"', NULL, NULL, NULL, NULL, 'Marca 31% de las primeras decisiones, sabor/fragancia 25%, formato 19%, tamaño 11%... y el precio solo 8%.', 'Se revela en la intro, slide 14.');
INSERT INTO questions (room_id, phase, ord, type, prompt, options, answer, unit, min, max, step, reveal, host_note) VALUES ('template', 0, 6, 'mito_realidad', 'En galletas, la marca es clave para decidir la compra.', '[]', '"REALIDAD"', NULL, NULL, NULL, NULL, 'Realidad: la marca es clave, define el 30% de las decisiones (1 de cada 3), pero no gana sola: el tamaño, el sabor y la variante definen el resto. Galletas es una categoría de ''marca compartida'' (como 17 de 22 categorías): marca + surtido correcto en cada canal. Para comparar: en pañales la marca pesa 60% y en jugos, 23%.', 'Se revela en la intro, slide 14. Pregunta clave para Mondelez. Dato Latam (metacaso CDH 2023–2026, 13 países).');
INSERT INTO questions (room_id, phase, ord, type, prompt, options, answer, unit, min, max, step, reveal, host_note) VALUES ('template', 0, 7, 'mito_realidad', 'Las marcas que más crecen son las que están en más canales.', '[]', '"MITO"', NULL, NULL, NULL, NULL, 'Las marcas que crecen a doble dígito compran en 2,5 canales en promedio; las que caen a doble dígito, en 2,4. La diferencia es cómo ejecutan, no en cuántos canales están.', 'Se revela en la intro, slide 15.');
INSERT INTO questions (room_id, phase, ord, type, prompt, options, answer, unit, min, max, step, reveal, host_note) VALUES ('template', 0, 8, 'intruso', 'Al elegir dónde hacer el mercado, ¿qué pesa más para el shopper colombiano?', '["Que sea barato y cerca, para rendir la plata","Que dé confianza: buen estado, seguridad y atención","Que sea fácil y rápido, con promociones claras","Que tenga mucha variedad para descubrir"]', '"Que sea barato y cerca, para rendir la plata"', NULL, NULL, NULL, NULL, 'Rendir el presupuesto mueve el 32% del valor, la confianza el 26%, la facilidad y las promociones el 24%, y la variedad y el descubrimiento el 18% (MAT Mar-26).', 'Reemplaza las preguntas de ''fuerzas''. Lánzala antes de tu slide ''Las necesidades que el shopper busca resolver…'' y ahí presentas los nombres de las 4 fuerzas.');
INSERT INTO phases (room_id, phase_id, title, multiplier, color, channels, drivers, phrase, timer_seconds, show_leaderboard, spend_share) VALUES ('template', 1, 'Si cuesta menos, mejor', 1, 'green', '["D1","Ísimo","Ara","Conveniencia"]', 'Ahorrar-Rendir + Shop Ability', 'El shopper resuelve sus necesidades cuidando al máximo el presupuesto', 30, 1, 32);
INSERT INTO questions (room_id, phase, ord, type, prompt, options, answer, unit, min, max, step, reveal, host_note) VALUES ('template', 1, 0, 'mito_realidad', 'En D1 la gente compra por impulso, sin planear lo que va a llevar.', '[]', '"MITO"', NULL, NULL, NULL, NULL, 'En D1 la compra es planeada: ''llevo una lista'' sobreindexa 1,46 vs el promedio de canales. Es el canal de la despensa: resolver todo al menor precio.', 'Puente a ''En este canal las compras no se hacen tanto de forma esporádica…''. Su shopper: Claudia, 42 años, Antioquia, NSE 3, hogar de 1 a 2 personas.');
INSERT INTO questions (room_id, phase, ord, type, prompt, options, answer, unit, min, max, step, reveal, host_note) VALUES ('template', 1, 1, 'ranking', 'Ordena de MAYOR a MENOR: ¿qué tanto recomiendan sus compradores a cada canal? (NPS = % de compradores que lo recomendaría menos % que no lo recomendaría)', '["Conveniencia","Ísimo","D1","Ara"]', '["D1","Ara","Ísimo","Conveniencia"]', NULL, NULL, NULL, NULL, 'D1 46% (1.er puesto de todos los canales) · Ara 35% (6.°) · Ísimo 9% (13.°) · Conveniencia −23%: hay más gente que no lo recomienda que la que sí (el NPS más bajo de todos).', 'Los cuatro juegan con precio, pero la satisfacción es muy distinta: no basta con ser barato, hay que cumplir el rol.');
INSERT INTO questions (room_id, phase, ord, type, prompt, options, answer, unit, min, max, step, reveal, host_note) VALUES ('template', 1, 2, 'intruso', 'Además del precio y la cercanía, ¿qué hace que la gente elija Ara más que otros canales?', '["Los volantes y revistas con las promociones","Las degustaciones","Que lleva a domicilio","Los productos importados"]', '"Los volantes y revistas con las promociones"', NULL, NULL, NULL, NULL, 'Los volantes y revistas con promociones sobreindexan 1,5 vs el promedio de canales, igual que la cercanía. Lideran los precios bajos y rendir el presupuesto (1,7). El 79% de sus compradores está satisfecho.', 'Puente a ''Ara domina: precio bajo y cercanía son su propuesta ganadora; aquí la búsqueda de volantes con promociones gana peso''.');
INSERT INTO questions (room_id, phase, ord, type, prompt, options, answer, unit, min, max, step, reveal, host_note) VALUES ('template', 1, 3, 'intruso', '¿Por qué elige la gente una tienda de Conveniencia?', '["Porque abre hasta tarde","Porque tiene los precios más bajos","Por los volantes de promociones","Por la variedad de marcas"]', '"Porque abre hasta tarde"', NULL, NULL, NULL, NULL, 'Los horarios amplios sobreindexan 2,6 veces vs el promedio. Le sigue encontrar promociones destacadas en exhibición (1,4). Es la compra económica e impulsiva para una necesidad puntual.', 'Puente a la propuesta: descuentos en galletas y chocolates de 10 pm a 7 am, cuando los Discounters (8 am a 9 pm) están cerrados.');
INSERT INTO phases (room_id, phase_id, title, multiplier, color, channels, drivers, phrase, timer_seconds, show_leaderboard, spend_share) VALUES ('template', 2, 'En busca de la mejor oportunidad', 1.25, 'purple', '["Olímpica","Éxito","Jumbo","Cadenas Independientes"]', 'Shop Ability + Exploración', 'Llena el carrito, pero elige el canal por la oportunidad: puntos, promociones y degustaciones', 30, 1, 23);
INSERT INTO questions (room_id, phase, ord, type, prompt, options, answer, unit, min, max, step, reveal, host_note) VALUES ('template', 2, 0, 'mito_realidad', 'En Olímpica, la gente compra principalmente porque tiene los precios más bajos.', '[]', '"MITO"', NULL, NULL, NULL, NULL, 'La motivación #1 es el programa de puntos y descuentos (index 1,6), seguida de los volantes (1,4). De hecho, el principal motivo para ser detractor son los precios altos (37%).', 'Puente a ''Aprovechar el rol Olímpica…'': hacer de los puntos un acelerador y ganar visibilidad en los volantes.');
INSERT INTO questions (room_id, phase, ord, type, prompt, options, answer, unit, min, max, step, reveal, host_note) VALUES ('template', 2, 1, 'intruso', '¿Qué atrae a la gente a Éxito más que a otros canales?', '["Que encuentra más que mercado: ropa, electrodomésticos, hogar","Que tiene los precios más bajos","Que queda cerca de la casa","Que abre hasta tarde"]', '"Que encuentra más que mercado: ropa, electrodomésticos, hogar"', NULL, NULL, NULL, NULL, 'Encontrar más que canasta básica sobreindexa 1,5; le siguen los últimos lanzamientos (1,4). El 81% de sus detractores lo son por precios altos.', 'Puente a ''Aprovechar el rol del Éxito…'': ahí deben vivir las innovaciones, nuevos sabores y ediciones especiales.');
INSERT INTO questions (room_id, phase, ord, type, prompt, options, answer, unit, min, max, step, reveal, host_note) VALUES ('template', 2, 2, 'intruso', '¿Qué hace que el shopper se antoje y pruebe cosas nuevas en Jumbo?', '["Las degustaciones","Los precios más bajos","Los horarios amplios","Que queda cerca de la casa"]', '"Las degustaciones"', NULL, NULL, NULL, NULL, 'Degustaciones: index 1,38. Y el 33% de sus compradores ''nunca lleva algo en mente: va a revisar qué se le antoja''.', 'Puente a ''Aprovechar el rol de Jumbo…'': degustaciones en momentos de alto tráfico (Oreo con helado, cheesecake de Oreo, Ritz con toppings).');
INSERT INTO questions (room_id, phase, ord, type, prompt, options, answer, unit, min, max, step, reveal, host_note) VALUES ('template', 2, 3, 'mito_realidad', 'Las cadenas regionales (Independientes) son el canal donde más formatos de galletas se encuentran.', '[]', '"MITO"', NULL, NULL, NULL, NULL, 'El shopper sí busca ahí variedad de empaques y tamaños (index 1,4), pero Independientes es apenas el 4.° canal en formatos de galletas (lidera Discounters). Ahí hay una oportunidad.', 'Puente a ''Aprovechar el rol de los independientes…'': adaptar formatos y sabores al ticket.');
INSERT INTO phases (room_id, phase_id, title, multiplier, color, channels, drivers, phrase, timer_seconds, show_leaderboard, spend_share) VALUES ('template', 3, 'Más opciones, más posibilidades', 1.5, 'orange', '["Droguerías de Cadena","Hiperbodegas","Carulla"]', 'Confianza + Exploración', 'Entra por variedad, novedad y experiencia, no por resolver la despensa', 30, 1, 6);
INSERT INTO questions (room_id, phase, ord, type, prompt, options, answer, unit, min, max, step, reveal, host_note) VALUES ('template', 3, 0, 'intruso', '¿Qué es lo que más pesa al elegir una droguería de cadena?', '["Que lleva los pedidos a domicilio","Que tiene los precios más bajos","Que tiene parqueadero","Que tiene productos importados"]', '"Que lleva los pedidos a domicilio"', NULL, NULL, NULL, NULL, 'El domicilio sobreindexa 4,9 veces: la motivación #1. Y el 50% de sus compradores va por un producto específico.', 'Puente a ''Impulsar las marcas por medio del domicilio…'': sección ''No olvides llevar'' en la app (ya estamos impulsando OREO).');
INSERT INTO questions (room_id, phase, ord, type, prompt, options, answer, unit, min, max, step, reveal, host_note) VALUES ('template', 3, 1, 'intruso', '¿En qué canal se gasta más plata en cada compra?', '["Hiperbodegas","Tienda de barrio","D1","Droguería de cadena"]', '"Hiperbodegas"', NULL, NULL, NULL, NULL, 'Hiperbodegas: $72.635 por compra y 8,6 unidades, el ticket más alto del mercado. Droguería de cadena $46.756, D1 $32.895, tienda de barrio $21.983.', 'Puente a la ficha de Hiperbodegas: salida planeada de alto volumen, con básicos en tamaños grandes.');
INSERT INTO questions (room_id, phase, ord, type, prompt, options, answer, unit, min, max, step, reveal, host_note) VALUES ('template', 3, 2, 'ranking', 'Ordena de MAYOR a MENOR: ¿qué tanto recomiendan sus compradores a cada canal? (NPS = % de compradores que lo recomendaría menos % que no lo recomendaría)', '["Carulla","Hiperbodegas","Droguerías de Cadena"]', '["Hiperbodegas","Droguerías de Cadena","Carulla"]', NULL, NULL, NULL, NULL, 'Hiperbodegas 42% (2.° puesto) · Droguerías de Cadena 32% (7.°) · Carulla 5% (14.°). El 84% de los detractores de Carulla lo son por precios altos.', 'El precio y la lejanía limitan el alcance de Hiperbodegas, pero fideliza fuerte a quien ya compra.');
INSERT INTO questions (room_id, phase, ord, type, prompt, options, answer, unit, min, max, step, reveal, host_note) VALUES ('template', 3, 3, 'mito_realidad', 'Carulla es un canal donde se hace la compra grande del mes.', '[]', '"MITO"', NULL, NULL, NULL, NULL, 'Carulla es de reposición y antojo: ''compro lo que se me antoja en el momento'' sobreindexa 1,62. Su fuerte: limpieza, frescura e importados.', 'Puente a ''Aprovechar el rol de Carulla como canal experiencial…''. Su shopper: Isabel, 60 años, NSE 5-6.');
INSERT INTO phases (room_id, phase_id, title, multiplier, color, channels, drivers, phrase, timer_seconds, show_leaderboard, spend_share) VALUES ('template', 4, 'A la vuelta de la esquina', 2, 'blue', '["Tienda de Barrio","Minimercados","Dollarcity","Droguerías de Barrio"]', 'Confianza + Ahorrar-Rendir', 'Se compra poco, muchas veces y sin desplazarse', 30, 1, 26);
INSERT INTO questions (room_id, phase, ord, type, prompt, options, answer, unit, min, max, step, reveal, host_note) VALUES ('template', 4, 0, 'intruso', '¿Cada cuánto va un hogar a la tienda de barrio?', '["Una vez al mes","Cada 15 días","Más de una vez por semana","Todos los días"]', '"Más de una vez por semana"', NULL, NULL, NULL, NULL, '57,2 veces al año (más de una vez por semana): la frecuencia más alta del mercado, con un ticket de $21.983.', 'Su shopper: Rosa, 40 años, Atlántico, NSE 1-2, hogar numeroso.');
INSERT INTO questions (room_id, phase, ord, type, prompt, options, answer, unit, min, max, step, reveal, host_note) VALUES ('template', 4, 1, 'mito_realidad', 'La gente va a la tienda de barrio porque tiene los precios más bajos.', '[]', '"MITO"', NULL, NULL, NULL, NULL, 'Gana por domicilio (index 2,9) y cercanía (2,4). El precio es el principal motivo para ser detractor (65%). Y no es compra impulsiva: ''llevo una lista'' sobreindexa 1,21.', 'Puente a ''Tiendas de barrio es un canal motivado por la cercanía y la recomendación del tendero''.');
INSERT INTO questions (room_id, phase, ord, type, prompt, options, answer, unit, min, max, step, reveal, host_note) VALUES ('template', 4, 2, 'intruso', '¿Por qué va la gente a Dollarcity?', '["Por los productos importados","Porque lleva a domicilio","Porque el vendedor le recomienda","Porque tiene los precios más bajos"]', '"Por los productos importados"', NULL, NULL, NULL, NULL, 'Productos importados: index 4,2. Además es el 3.er canal en recomendación (NPS 40%).', 'Puente a la propuesta: canal de prueba para lanzamientos importados y de temporada (Oreo Red Velvet, S''Moreo, calendario de Adviento).');
INSERT INTO questions (room_id, phase, ord, type, prompt, options, answer, unit, min, max, step, reveal, host_note) VALUES ('template', 4, 3, 'intruso', 'En la droguería de barrio la gente compra poquito (unas 2 cosas por visita). ¿Dónde tiene más sentido poner nuestras galletas?', '["En la caja, con ristras de producto individual","Con degustaciones","En volantes de promociones","En la góndola de lonchera grande"]', '"En la caja, con ristras de producto individual"', NULL, NULL, NULL, NULL, 'Es un canal de confianza y cercanía: ''hay alguien dispuesto a ayudar'' sobreindexa 1,9 y el domicilio 3,6. Con 2,3 unidades por compra, el momento clave es el punto de pago.', 'Puente a ''Aunque es un canal impulsado por categorías enfocadas en la salud…''.');
INSERT INTO phases (room_id, phase_id, title, multiplier, color, channels, drivers, phrase, timer_seconds, show_leaderboard, spend_share) VALUES ('template', 5, 'PREGUNTA DE ORO', 3, 'gold', '[]', '', 'Una sola pregunta, multiplicador x3. Es el momento de arriesgar.', 40, 0, NULL);
INSERT INTO questions (room_id, phase, ord, type, prompt, options, answer, unit, min, max, step, reveal, host_note) VALUES ('template', 5, 0, 'numeric', '¿En cuántos canales distintos compra al año un hogar colombiano su consumo masivo?', '[]', '13.7', 'canales', 1, 25, 0.1, '13,7 canales al año, más que el promedio de Latam (11,2). El shopper colombiano es de los más omnicanales de la región: no existe un canal perfecto, cada uno cumple un rol distinto.', 'Cierre: la pregunta no es dónde compra el shopper, sino qué rol le da a cada canal. Después, podio final.');
