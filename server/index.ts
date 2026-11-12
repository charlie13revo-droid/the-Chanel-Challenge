import express from 'express';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server, Socket } from 'socket.io';
import { openDb } from './db.ts';
import { Game } from './game.ts';
import type { Ack } from '../shared/types.ts';

const here = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3001);

const app = express();
const http = createServer(app);
const io = new Server(http, {
  cors: process.env.CORS_ORIGIN ? { origin: process.env.CORS_ORIGIN.split(',') } : undefined,
  pingInterval: 20000,
  pingTimeout: 25000,
  maxHttpBufferSize: 64 * 1024,
});
const db = openDb();
const game = new Game(db, io);

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Exportar resultados a CSV (requiere PIN del host en la cabecera x-host-pin).
app.get('/api/rooms/:code/results.csv', (req, res) => {
  const auth = game.authHost(req.params.code, String(req.header('x-host-pin') ?? ''));
  if (!auth.ok) return res.status(401).json(auth);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="channel-challenge-${auth.data!.code}.csv"`);
  res.send(game.exportCsv(auth.data!.roomId));
});

// Frontend compilado (producción).
const dist = join(here, '..', 'dist');
if (existsSync(dist)) {
  app.use(express.static(dist, { maxAge: '1h', index: false }));
  app.get('*', (_req, res) => res.sendFile(join(dist, 'index.html')));
}

type Cb<T = unknown> = (ack: Ack<T>) => void;
const safe =
  <A>(fn: (arg: A, cb: Cb) => void) =>
  (arg: A, cb?: Cb) => {
    const reply: Cb = typeof cb === 'function' ? cb : () => {};
    try {
      fn(arg ?? ({} as A), reply);
    } catch (e) {
      console.error(e);
      reply({ ok: false, error: 'Error inesperado en el servidor.' });
    }
  };

io.on('connection', (socket: Socket) => {
  let authAttempts = 0;

  const becomeHost = (roomId: string) => {
    socket.data.hostRoom = roomId;
    socket.join([`h:${roomId}`, `r:${roomId}`]);
  };

  socket.on(
    'screen:watch',
    safe<{ code: string }>(({ code }, cb) => {
      const room = game.roomByCode(code);
      if (!room) return cb({ ok: false, error: 'Sala no encontrada.' });
      socket.join(`r:${room.id}`);
      cb({ ok: true, data: game.publicState(room.id) });
    }),
  );

  socket.on(
    'host:create',
    safe<{ pin: string }>(({ pin }, cb) => {
      const r = game.createRoom(String(pin ?? ''));
      if (!r.ok) return cb(r);
      becomeHost(r.data!.roomId);
      cb({ ok: true, data: { code: r.data!.code, state: game.hostState(r.data!.roomId) } });
    }),
  );

  socket.on(
    'host:auth',
    safe<{ code: string; pin: string }>(({ code, pin }, cb) => {
      if (++authAttempts > 10) return cb({ ok: false, error: 'Demasiados intentos. Recarga la página.' });
      const r = game.authHost(String(code ?? ''), String(pin ?? ''));
      if (!r.ok) return cb(r);
      becomeHost(r.data!.roomId);
      cb({ ok: true, data: { code: r.data!.code, state: game.hostState(r.data!.roomId) } });
    }),
  );

  socket.on(
    'host:action',
    safe<{ action: string; payload?: Record<string, unknown> }>(({ action, payload }, cb) => {
      const roomId = socket.data.hostRoom as string | undefined;
      if (!roomId) return cb({ ok: false, error: 'No autorizado.' });
      cb(game.hostAction(roomId, String(action), payload ?? {}));
    }),
  );

  socket.on(
    'host:bank',
    safe<void>((_a, cb) => {
      const roomId = socket.data.hostRoom as string | undefined;
      if (!roomId) return cb({ ok: false, error: 'No autorizado.' });
      cb({ ok: true, data: game.bank(roomId) });
    }),
  );

  // Un socket representa a un solo jugador: al cambiar de sesión se suelta la anterior.
  const detachPlayer = () => {
    const prev = socket.data.playerId as string | undefined;
    if (!prev) return;
    game.detachSocket(prev, socket.id);
    for (const room of socket.rooms) if (room !== socket.id && !room.startsWith('h:')) socket.leave(room);
    socket.data.playerId = undefined;
  };

  const attachPlayer = (playerId: string, roomId: string) => {
    if (socket.data.playerId && socket.data.playerId !== playerId) detachPlayer();
    socket.data.playerId = playerId;
    socket.join([`r:${roomId}`, `p:${playerId}`]);
    game.attachSocket(playerId, socket.id);
  };

  socket.on(
    'player:join',
    safe<{ code: string; nickname: string; team?: string }>(({ code, nickname, team }, cb) => {
      const r = game.join(String(code ?? ''), String(nickname ?? ''), team);
      if (!r.ok) return cb(r);
      detachPlayer();
      attachPlayer(r.data!.playerId, r.data!.roomId);
      cb({
        ok: true,
        data: { token: r.data!.token, state: game.publicState(r.data!.roomId), me: game.playerState(r.data!.playerId) },
      });
    }),
  );

  socket.on(
    'player:resume',
    safe<{ token: string }>(({ token }, cb) => {
      const p = game.resume(token);
      if (!p) return cb({ ok: false, error: 'Sesión no válida.' });
      attachPlayer(p.id, p.room_id);
      cb({ ok: true, data: { state: game.publicState(p.room_id), me: game.playerState(p.id) } });
    }),
  );

  socket.on(
    'player:answer',
    safe<{ questionId: number; value: unknown; bet: number; token?: string }>((body, cb) => {
      let playerId = socket.data.playerId as string | undefined;
      // Si la conexión se acaba de restablecer y aún no se reanudó la sesión, el token identifica al jugador.
      if (!playerId && body?.token) {
        const p = game.resume(String(body.token));
        if (p) {
          attachPlayer(p.id, p.room_id);
          playerId = p.id;
        }
      }
      if (!playerId) return cb({ ok: false, error: 'Vuelve a entrar a la sala.' });
      const r = game.submitAnswer(playerId, body);
      cb(r.ok ? { ok: true, data: game.playerState(playerId) } : r);
    }),
  );

  socket.on('disconnect', () => {
    if (socket.data.playerId) game.detachSocket(socket.data.playerId, socket.id);
  });
});

http.listen(PORT, () => {
  console.log(`The Channel Challenge escuchando en http://localhost:${PORT}`);
});

const shutdown = () => {
  game.stop();
  io.close();
  db.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
