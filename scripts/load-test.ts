// Prueba de carga y de flujo completo: N jugadores simulados juegan todo el juego contra el servidor real.
// Uso: npm run load-test -- [url] [jugadores]     (por defecto http://localhost:3001 y 300)
import { io, Socket } from 'socket.io-client';
import { HttpsProxyAgent } from 'https-proxy-agent';
import type { Ack, HostState, PlayerState, PublicState } from '../shared/types.ts';

const URL = process.argv[2] ?? 'http://localhost:3001';
const N = Number(process.argv[3] ?? 300);
const PIN = '4321';
// Si hay un proxy corporativo (HTTPS_PROXY), las conexiones salen por él.
const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
const agent = proxy && URL.startsWith('https') ? new HttpsProxyAgent(proxy) : undefined;
if (agent) {
  const { setGlobalDispatcher, ProxyAgent } = await import('undici');
  setGlobalDispatcher(new ProxyAgent(proxy!));
}

const emit = <T>(s: Socket, ev: string, data?: unknown) =>
  new Promise<Ack<T>>((res) => s.timeout(15000).emit(ev, data, (err: unknown, r: Ack<T>) => res(err ? { ok: false, error: 'timeout' } : r)));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const connect = () =>
  new Promise<Socket>((res, rej) => {
    const s = io(URL, { transports: process.env.LT_POLLING ? ['polling'] : ['polling', 'websocket'], forceNew: true, agent } as never);
    s.once('connect', () => res(s));
    s.once('connect_error', rej);
  });

interface Bot {
  s: Socket;
  token: string;
  me: PlayerState | null;
  state: PublicState | null;
  answered: Set<number>;
  latencies: number[];
}

async function main() {
  const host = await connect();
  const created = await emit<{ code: string; state: HostState }>(host, 'host:create', { pin: PIN });
  if (!created.ok) throw new Error(created.error);
  const code = created.data!.code;
  let hs = created.data!.state;
  host.on('host:state', (s: HostState) => (hs = s));
  console.log(`Sala ${code} creada. Conectando ${N} jugadores…`);

  const t0 = Date.now();
  const bots: Bot[] = [];
  const batch = 50;
  for (let i = 0; i < N; i += batch) {
    await Promise.all(
      Array.from({ length: Math.min(batch, N - i) }, async (_, k) => {
        const s = await connect();
        const r = await emit<{ token: string; state: PublicState; me: PlayerState }>(s, 'player:join', {
          code,
          nickname: `Jugador ${i + k + 1}`,
          team: ['Ventas', 'Trade', 'Marketing'][(i + k) % 3],
        });
        if (!r.ok) throw new Error(`join ${i + k}: ${r.error}`);
        const b: Bot = { s, token: r.data!.token, me: r.data!.me, state: r.data!.state, answered: new Set(), latencies: [] };
        s.on('state', (st: PublicState) => (b.state = st));
        s.on('me', (m: PlayerState) => (b.me = m));
        bots.push(b);
      }),
    );
  }
  console.log(`${N} jugadores unidos en ${Date.now() - t0} ms`);

  const act = async (action: string, payload?: Record<string, unknown>) => {
    const r = await emit(host, 'host:action', { action, payload });
    if (!r.ok) throw new Error(`${action}: ${r.error}`);
    await sleep(400);
  };

  // Reconexión: un jugador se cae y vuelve con su token.
  const victim = bots[0];
  victim.s.disconnect();
  victim.s = await connect();
  victim.s.on('state', (st: PublicState) => (victim.state = st));
  victim.s.on('me', (m: PlayerState) => (victim.me = m));
  const resumed = await emit<{ me: PlayerState }>(victim.s, 'player:resume', { token: victim.token });
  if (!resumed.ok || resumed.data!.me.balance !== 1000) throw new Error('La reconexión no conservó el saldo');
  console.log('✔ Reconexión conserva el saldo');

  let questions = 0;
  let slowestResult = 0;
  while (true) {
    const st = hs.public.state;
    if (st === 'finished') break;
    if (st === 'lobby' || (st === 'phase_end' && hs.hasNextPhase)) await act('startPhase');
    else if (st === 'phase_end') await act('next');
    else if (st === 'phase_intro' || st === 'ready') {
      await act('openQuestion', { timeLimit: 20 });
      const q = hs.public.question!;
      questions++;
      // 95% responde, con apuestas variadas
      await Promise.all(
        bots.map(async (b, idx) => {
          const everyone = q.phase === 5; // en la Pregunta de Oro responden todos → cierre y revelación automáticos
          if (idx % 20 === 19 && !everyone) return; // 5% no responde
          await sleep(Math.random() * 1500);
          const bal = b.me!.balance;
          const min = Math.min(bal, Math.ceil(bal * 0.1));
          const bet = Math.min(bal, Math.max(min, Math.round(bal * [0.1, 0.25, 0.5, 1][idx % 4])));
          let value: unknown;
          if (q.type === 'mito_realidad') value = idx % 2 ? 'MITO' : 'REALIDAD';
          else if (q.type === 'intruso') value = q.options[idx % q.options.length];
          else if (q.type === 'ranking') value = [...q.options].sort(() => Math.random() - 0.5);
          else value = (q.min ?? 0) + Math.random() * ((q.max ?? 100) - (q.min ?? 0));
          const t = Date.now();
          const r = await emit<PlayerState>(b.s, 'player:answer', { questionId: q.id, value, bet });
          b.latencies.push(Date.now() - t);
          if (!r.ok) throw new Error(`answer: ${r.error}`);
          b.answered.add(q.id);
          // Doble envío debe ser rechazado
          if (idx === 1) {
            const again = await emit(b.s, 'player:answer', { questionId: q.id, value, bet });
            if (again.ok) throw new Error('Se aceptó una segunda apuesta');
          }
          // Apuesta inválida (menor al 10%) debe ser rechazada — se prueba con un jugador que no respondió
        }),
      );
      // Validación: apuesta por debajo del mínimo
      const lazy = bots[19];
      const bad = await emit(lazy.s, 'player:answer', { questionId: q.id, value: q.type === 'ranking' ? q.options : q.type === 'numeric' ? q.min : q.type === 'mito_realidad' ? 'MITO' : q.options[0], bet: 1 });
      if (bad.ok && (lazy.me?.balance ?? 0) > 10) throw new Error('Se aceptó una apuesta menor al 10%');
      const before = new Map(bots.map((b) => [b.token, b.me!.balance]));
      await sleep(1100); // throttle de conteos (1 s)
      const answered = hs.public.answeredCount;
      const expected = q.phase === 5 ? N : bots.filter((_, i) => i % 20 !== 19).length;
      if (answered !== expected) throw new Error(`Conteo de respuestas ${answered} ≠ ${expected}`);
      if (q.phase === 5) {
        // Modo automático: el servidor debe cerrar y revelar sin intervención del host.
        const t = Date.now();
        while (hs.public.state !== 'revealed' && Date.now() - t < 10000) await sleep(100);
        if (hs.public.state !== 'revealed') throw new Error('El modo automático no reveló la pregunta');
        console.log(`✔ Modo automático: cerró y reveló solo en ${Date.now() - t + 1100} ms tras la última apuesta`);
      } else {
        await act('lock');
        await act('reveal');
      }
      // Todos reciben su resultado personal (por red puede tardar un poco) y el saldo cuadra
      const tr = Date.now();
      while (bots.some((b) => b.me!.myResult?.questionId !== q.id) && Date.now() - tr < 10000) await sleep(100);
      slowestResult = Math.max(slowestResult, Date.now() - tr);
      for (const b of bots) {
        const r = b.me!.myResult;
        if (!r || r.questionId !== q.id) throw new Error(`Falta resultado para ${b.me!.nickname}`);
        if (before.get(b.token)! + r.delta + r.bonus !== b.me!.balance) throw new Error(`Saldo inconsistente para ${b.me!.nickname}`);
        if (b.me!.balance < 0) throw new Error('Saldo negativo');
      }
      const rv = hs.public.reveal!;
      console.log(
        `F${q.phase}-P${q.order + 1} ${q.type.padEnd(13)} respondieron ${rv.respondents}, acierto ${rv.correctPct}%` +
          (rv.closest ? `, bono → ${rv.closest.nickname}` : ''),
      );
      await act('leaderboard');
      if (!hs.public.leaderboard || hs.public.leaderboard.length !== 10) throw new Error('Top 10 vacío');
      await act('next');
    } else throw new Error(`Estado inesperado ${st}`);
  }

  const lat = bots.flatMap((b) => b.latencies).sort((a, b) => a - b);
  const p = (x: number) => lat[Math.floor(lat.length * x)];
  console.log(`\n✔ Juego completo: ${questions} preguntas, ${N} jugadores`);
  console.log(`  Resultado personal más lento tras revelar: ${slowestResult} ms`);
  console.log(`  Latencia de apuesta: p50 ${p(0.5)} ms · p95 ${p(0.95)} ms · p99 ${p(0.99)} ms`);
  console.log(`  Podio: ${hs.public.final!.podium.map((e) => `${e.nickname} (${e.balance})`).join(' · ')}`);

  const csv = await fetch(`${URL}/api/rooms/${code}/results.csv`, { headers: { 'x-host-pin': PIN } });
  const text = await csv.text();
  const rows = text.trim().split('\r\n');
  if (!csv.ok || rows.length !== N + 1) throw new Error(`CSV inválido (${rows.length} filas)`);
  console.log(`✔ CSV exportado: ${rows.length - 1} filas, ${rows[0].split(';').length} columnas`);
  const unauth = await fetch(`${URL}/api/rooms/${code}/results.csv`, { headers: { 'x-host-pin': '0000' } });
  if (unauth.status !== 401) throw new Error('CSV sin PIN debería ser 401');

  host.disconnect();
  bots.forEach((b) => b.s.disconnect());
  console.log(`Sala de prueba: ${code}`);
}

main().catch((e) => {
  console.error('✗', e.message);
  process.exit(1);
});
