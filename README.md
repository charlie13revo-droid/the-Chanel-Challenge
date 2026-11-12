# The Channel Challenge

**Publicada en: https://channel-challenge.onrender.com** · Panel del presentador: https://channel-challenge.onrender.com/host

## Guía rápida para el día del evento (una sola persona)

1. **10 minutos antes**, abre https://channel-challenge.onrender.com/host. El plan gratuito de Render se apaga tras 15 minutos sin uso; la primera visita lo despierta (tarda hasta 1 minuto). Mientras el panel o la pantalla estén abiertos, no se vuelve a dormir.
2. **Crear sala nueva** → elige un PIN de 4–8 dígitos (anótalo).
3. Pulsa **🖥️ Abrir vista Pantalla** y comparte **esa ventana** en Teams. Ahí está el QR y el código para que la gente entre desde el celular.
4. Deja el **panel** en otra ventana o en otro monitor. Todo el juego se maneja con **un solo botón: "Siguiente paso"**, o con la **barra espaciadora**, la **flecha →** o un **clicker de presentaciones**.
5. Con el **Modo automático** (activado por defecto), la pregunta se cierra sola cuando todos los conectados apostaron o se acaba el tiempo, y la respuesta se revela sola. Tú solo avanzas después de explicar cada dato.
6. Al final: **⬇️ Exportar CSV** con los resultados.

Un ciclo por pregunta = **3 pulsaciones**: abrir pregunta → (se cierra y revela sola) → ver ranking → siguiente.
Para ensayar sin público: **+ 20 bots** y, después, **↺ Reiniciar partida** (todos vuelven a 1.000 puntos).

**Plan gratuito:** si el servidor se reinicia, la base de datos se borra (las partidas son de un solo evento, así que en la práctica no afecta si no se reinicia durante el juego). Para un evento crítico, cambia el servicio a **Starter** (unos USD 7 al mes) y agrega un disco en `/var/data` con la variable `DB_FILE=/var/data/channel-challenge.db`: con eso los saldos sobreviven a cualquier reinicio.

**Publicar cambios:** el servicio no se actualiza solo con cada push. En Render → *channel-challenge* → **Manual Deploy → Deploy latest commit**.

---

Trivia multijugador en tiempo real con apuestas tipo subasta, para presentaciones virtuales (Teams).
Antes de cada capítulo del estudio de canales, el público **apuesta** cómo cree que se comporta el shopper; después se **revela la data**.

- **Vista Jugador** (celular): `/join/CODIGO` o `/` → código + apodo.
- **Vista Host** (presentador, con PIN): `/host`.
- **Vista Pantalla** (16:9, para compartir en Teams): `/screen/CODIGO`.

Probado con **300 jugadores simultáneos** en local y con **100 jugadores en el servidor publicado** (juego completo de 21 preguntas, apuestas confirmadas en ~110 ms por internet). También se probó el reinicio del servidor con una pregunta abierta (nadie pierde saldo ni apuesta) y un juego completo manejado solo con la barra espaciadora.

---

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | React 18 + Vite + TypeScript + Tailwind CSS 4 (mobile-first) |
| Tiempo real | Node 22 + Express + **Socket.io** |
| Base de datos | **SQLite** (`node:sqlite`, incluido en Node: sin dependencias nativas) |

El prompt pedía Supabase y aceptaba **Node + Socket.io con el mismo modelo de datos** como alternativa. Se eligió esa opción porque:
un solo servicio (sin cuentas externas), toda la lógica de puntaje vive en el servidor y nunca en el cliente, y SQLite persiste salas, jugadores y respuestas (si el servidor se reinicia, nadie pierde su saldo).
El modelo de datos (`rooms`, `players`, `questions`, `answers`) es el de la sección 7 del prompt, más una tabla `phases` para los capítulos editables.

## Estructura

```
data/seed.json            Banco de preguntas (cifras EXACTAS del estudio) + metadatos de los 4 capítulos y la Pregunta de Oro
data/channel_challenge.sql Script SQL: esquema + banco semilla (se regenera con `npm run db:sql`)
server/schema.sql         Esquema de tablas
server/scoring.ts         Reglas de puntaje (funciones puras, con pruebas)
server/game.ts            Máquina de estados, validación de apuestas, ranking, bots, CSV
server/index.ts           Servidor HTTP + Socket.io
shared/types.ts           Tipos compartidos cliente/servidor
client/src/pages/         Home (unirse), Play (jugador), Host (panel), Screen (pantalla 16:9)
tests/                    Pruebas unitarias de puntaje
scripts/load-test.ts      Prueba de carga y de flujo completo (N jugadores simulados)
```

## Correr en local

Requisitos: **Node 22.13 o superior**.

```bash
npm install
npm run dev
```

- Abre `http://localhost:5173/host` → **Crear sala nueva** → elige un PIN.
- Abre la vista Pantalla con el botón **🖥️ Abrir vista Pantalla**.
- En **Modo demo** pulsa **+ 20 bots** para probar sin público.
- Desde el celular (misma red Wi-Fi) entra a `http://IP-DE-TU-PC:5173` o escanea el QR.

Pruebas:

```bash
npm test
```

Prueba de carga (respeta `HTTPS_PROXY` si estás detrás de un proxy) y prueba de reinicio del servidor:

```bash
npm run load-test -- http://localhost:3001 300
```

```bash
npm run restart-test
```

## Producción

```bash
npm run build
npm start
```

Un solo proceso sirve el frontend compilado (`dist/`) y el WebSocket en el puerto `PORT` (3001 por defecto).

Variables de entorno:

| Variable | Por defecto | Uso |
|---|---|---|
| `PORT` | `3001` | Puerto HTTP |
| `DB_FILE` | `data/channel-challenge.db` | Archivo SQLite. **Debe estar en un disco persistente.** |
| `CORS_ORIGIN` | (vacío) | Solo si el frontend se sirve desde otro dominio |

### Desplegar en Render (recomendado)

1. Sube este proyecto a un repositorio de GitHub.
2. En Render: **New → Blueprint** y elige el repositorio. Render lee `render.yaml`: crea un servicio Docker con un disco persistente de 1 GB en `/data`.
3. Al terminar, abre `https://TU-SERVICIO.onrender.com/host`.

Usa un plan **pago** (Starter): el plan gratuito se duerme y pierde el disco.

### Otras opciones

- **Railway / Fly.io:** usan el `Dockerfile` incluido. Monta un volumen en `/data`.
- **VPS propio:** `npm ci && npm run build && npm start` detrás de Nginx (habilita WebSocket con `proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade";`).
- **Vercel / Netlify NO sirven** para este backend: no mantienen conexiones WebSocket ni un proceso persistente.

Con 300+ jugadores, una sola instancia de 0,5 vCPU / 512 MB es suficiente. No escales a varias instancias: el estado del juego vive en un solo proceso.

## Reglas implementadas (sección 4 del prompt)

- Saldo inicial **1.000**. Apuesta mínima **10% del saldo** (redondeado hacia arriba), máxima **ALL-IN**. Validado en el servidor.
- Multiplicador por fase: x1 · x1,25 · x1,5 · x2 · Pregunta de Oro x3 (editable por fase y, opcionalmente, por pregunta).
- **Mito/Realidad e Intruso:** acierta +G, falla −apuesta (G = apuesta × multiplicador).
- **Ranking:** todas bien +1,5×G · 2 bien 0 · 0–1 bien −apuesta. En la fase 3 (3 ítems) solo son posibles 0, 1 o 3 aciertos, así que 1 acierto resta la apuesta.
  Los ítems se muestran **barajados** (igual en la pantalla y en todos los celulares) y nunca en el orden correcto. En el banco original, la pregunta de frecuencia de la fase 1 trae los ítems ya en el orden correcto.
- **Dato correcto:** error = |respuesta − real| / real. ≤5% +2×G · ≤15% +G · ≤30% 0 · >30% −apuesta. **Bono +100** al más cercano de la sala (empate → el más rápido).
- **Sin respuesta:** pierde la apuesta mínima (10%).
- **Rescate:** al iniciar cada fase, si el saldo es < 100, se recarga a 300.
- **Desempate del ranking:** menor tiempo total de respuesta (quien no responde suma el tiempo completo).
- Para el "% de acierto": cuentan como acierto las respuestas que ganan puntos por regla (Ranking perfecto; Dato con error ≤15%).

## Flujo del host

**Iniciar fase → Abrir pregunta → Cerrar apuestas → Revelar → Ver ranking → Siguiente**.
El botón recomendado se resalta en rosado. La pregunta se cierra sola al terminar el tiempo (40 s por defecto, configurable por pregunta, por sala y justo antes de abrir).
Al terminar cada fase: podio de la fase + tarjeta **"La sala vs. la realidad"**. Al final: podio con confeti y Top 10.

El panel también tiene:
- **📝 Preguntas:** edita enunciados, opciones, respuestas, rangos, textos de revelación, notas y tiempos (las preguntas ya jugadas quedan bloqueadas hasta reiniciar). También permite **restaurar el banco original**.
- **👥 Jugadores:** buscar y **expulsar** (el apodo queda bloqueado en esa sala). Además hay un filtro básico de apodos ofensivos al entrar.
- **⬇️ Exportar CSV:** jugador, equipo, puntos por pregunta (F1-P1…F5-P1), total y tiempo. Usa separador `;` y BOM para que Excel en español lo abra bien.
- **↺ Reiniciar partida:** borra respuestas y devuelve a todos a 1.000 (útil después de ensayar con bots).

## Reconexión

El jugador guarda un token en `localStorage`. Si se cae la conexión o recarga la página, Socket.io reconecta solo y el servidor le devuelve su saldo, su apuesta y su resultado.
Si el host recarga, el PIN guardado en la pestaña (`sessionStorage`) lo vuelve a autenticar.

## Seguridad

- El PIN se guarda con hash `scrypt`; máximo 10 intentos por conexión.
- Los clientes nunca reciben la respuesta correcta antes de revelar. El enunciado de la siguiente pregunta tampoco se envía antes de abrirla.
- Todo el puntaje se calcula en una transacción del servidor al revelar.
