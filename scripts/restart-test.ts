// Prueba de resiliencia: reinicia el servidor con una pregunta abierta y verifica que nadie pierda saldo ni apuesta.
// Uso: npm run restart-test
import { spawn, ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { io, Socket } from 'socket.io-client';
import type { Ack, HostState, PlayerState, PublicState } from '../shared/types.ts';

const PORT = 3011;
const URL = `http://localhost:${PORT}`;
const dir = mkdtempSync(join(tmpdir(), 'cc-restart-'));
const DB = join(dir, 'test.db');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const emit = <T>(s: Socket, ev: string, data?: unknown) =>
  new Promise<Ack<T>>((res) => s.timeout(8000).emit(ev, data, (err: unknown, r: Ack<T>) => res(err ? { ok: false, error: 'timeout' } : r)));
const check = (cond: unknown, msg: string) => {
  if (!cond) throw new Error(msg);
  console.log('✔', msg);
};

function startServer(): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', '--import', 'tsx', 'server/index.ts'], {
      env: { ...process.env, PORT: String(PORT), DB_FILE: DB },
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    p.stdout!.on('data', (d) => String(d).includes('escuchando') && resolve(p));
    p.on('error', reject);
  });
}
const stopServer = (p: ChildProcess) => new Promise((r) => (p.once('exit', r), p.kill('SIGKILL')));
const connect = () => io(URL, { transports: ['websocket'], forceNew: true, reconnectionDelay: 200, reconnectionDelayMax: 500 });

async function main() {
  let server = await startServer();
  const host = connect();
  let hs!: HostState;
  host.on('host:state', (s: HostState) => (hs = s));
  const created = await emit<{ code: string; state: HostState }>(host, 'host:create', { pin: '1111' });
  const code = created.data!.code;
  hs = created.data!.state;

  const players: { s: Socket; token: string; me: PlayerState; state?: PublicState }[] = [];
  for (let i = 0; i < 10; i++) {
    const s = connect();
    const r = await emit<{ token: string; me: PlayerState }>(s, 'player:join', { code, nickname: `P${i}` });
    const pl = { s, token: r.data!.token, me: r.data!.me } as (typeof players)[number];
    s.on('me', (m: PlayerState) => (pl.me = m));
    s.on('state', (st: PublicState) => (pl.state = st));
    // Igual que el cliente real: al reconectar, reanuda la sesión con el token.
    s.on('connect', async () => {
      const rr = await emit<{ me: PlayerState; state: PublicState }>(s, 'player:resume', { token: pl.token });
      if (rr.ok) {
        pl.me = rr.data!.me;
        pl.state = rr.data!.state;
      }
    });
    players.push(pl);
  }
  host.on('connect', () => void emit(host, 'host:auth', { code, pin: '1111' }));

  await emit(host, 'host:action', { action: 'startPhase' });
  await emit(host, 'host:action', { action: 'openQuestion', payload: { timeLimit: 12 } });
  await sleep(300);
  const q = hs.public.question!;
  for (let i = 0; i < 5; i++) {
    const r = await emit(players[i].s, 'player:answer', { questionId: q.id, value: 32, bet: 500 });
    if (!r.ok) throw new Error(r.error);
  }

  console.log('… reiniciando el servidor con la pregunta abierta');
  await stopServer(server);
  await sleep(500);
  server = await startServer();
  await sleep(2500); // reconexión automática

  check(players.every((p) => p.s.connected), 'Todos los jugadores se reconectaron solos');
  check(players.every((p) => p.state?.state === 'open'), 'La pregunta sigue abierta tras el reinicio');
  check(players.slice(0, 5).every((p) => p.me.myAnswer?.bet === 500), 'Las apuestas hechas antes del reinicio se conservan');
  check(players.every((p) => p.me.balance === 1000), 'Los saldos se conservan');
  for (let i = 5; i < 9; i++) {
    const r = await emit(players[i].s, 'player:answer', { questionId: q.id, value: 10, bet: 100 });
    if (!r.ok) throw new Error(r.error);
  }
  check(true, 'Se aceptan apuestas nuevas después del reinicio');
  // Conexión nueva que todavía no reanudó la sesión: la apuesta se identifica por el token.
  const fresh = connect();
  await new Promise<void>((r) => fresh.once('connect', () => r()));
  const viaToken = await emit(fresh, 'player:answer', { questionId: q.id, value: 10, bet: 100, token: players[9].token });
  check(viaToken.ok, 'Una apuesta enviada justo al reconectar se acepta gracias al token');
  const forged = await emit(connect(), 'player:answer', { questionId: q.id, value: 10, bet: 100, token: 'token-falso' });
  check(!forged.ok, 'Un token inválido es rechazado');
  fresh.disconnect();

  // Todos respondieron → modo automático cierra y revela.
  const t = Date.now();
  while (players[0].state?.state !== 'revealed' && Date.now() - t < 8000) await sleep(100);
  check(players[0].state?.state === 'revealed', 'Cierre y revelación automáticos funcionan después del reinicio');
  await sleep(300);
  check(players[0].me.balance === 1000 + 1000 + 100, 'Puntaje correcto (32% exacto con apuesta 500 → +1000, más bono +100)');
  check(players[5].me.balance === 900, 'Puntaje correcto (respuesta lejana con apuesta 100 → −100)');

  // El host recarga la página: vuelve a autenticarse y ve el mismo estado.
  const host2 = connect();
  const auth = await emit<{ state: HostState }>(host2, 'host:auth', { code, pin: '1111' });
  check(auth.ok && auth.data!.state.public.state === 'revealed', 'El host puede volver a entrar al panel con su PIN');
  const bad = await emit(host2, 'host:auth', { code, pin: '9999' });
  check(!bad.ok, 'Un PIN incorrecto es rechazado');

  [host, host2, ...players.map((p) => p.s)].forEach((s) => s.disconnect());
  await stopServer(server);
  rmSync(dir, { recursive: true, force: true });
  console.log('\n✔ Prueba de reinicio superada');
  process.exit(0);
}

main().catch((e) => {
  console.error('✗', e.message);
  process.exit(1);
});
