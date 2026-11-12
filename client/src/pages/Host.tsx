import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { HostState } from '../../../shared/types.ts';
import { AdminEditor } from '../components/AdminEditor.tsx';
import { Button, Card, ConnectionDot, CountdownRing, ErrorText, Logo, PhaseBadge, ProgressBar, Qr, TypeBadge } from '../components/ui.tsx';
import { answerLabel, fmt, STATE_LABEL } from '../lib/format.ts';
import { syncClock, useCountdown } from '../lib/hooks.ts';
import { getHostSession, saveHostSession } from '../lib/session.ts';
import { call, socket } from '../lib/socket.ts';

export function HostPage() {
  const [session, setSession] = useState(getHostSession());
  const [hs, setHs] = useState<HostState | null>(null);
  const [connected, setConnected] = useState(socket.connected);
  const [authError, setAuthError] = useState('');

  const auth = useCallback(async (s: { code: string; pin: string }) => {
    const r = await call<{ code: string; state: HostState }>('host:auth', s);
    if (!r.ok) {
      setAuthError(r.error ?? 'No autorizado');
      saveHostSession(null);
      setSession(null);
      return;
    }
    syncClock(r.data!.state.public.serverNow);
    setHs(r.data!.state);
  }, []);

  useEffect(() => {
    const onHost = (s: HostState) => {
      syncClock(s.public.serverNow);
      setHs(s);
    };
    const onConnect = () => {
      setConnected(true);
      const s = getHostSession();
      if (s) void auth(s);
    };
    const onDisconnect = () => setConnected(false);
    socket.on('host:state', onHost);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    if (socket.connected && session) void auth(session);
    return () => {
      socket.off('host:state', onHost);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, [auth, session]);

  if (!session || !hs)
    return (
      <HostEntry
        error={authError}
        onReady={(s, state) => {
          saveHostSession(s);
          setSession(s);
          setHs(state);
        }}
      />
    );
  return (
    <HostPanel
      hs={hs}
      pin={session.pin}
      connected={connected}
      onLogout={() => {
        saveHostSession(null);
        setSession(null);
        setHs(null);
      }}
    />
  );
}

// ---------- Crear o entrar a una sala ----------
function HostEntry({ onReady, error }: { onReady: (s: { code: string; pin: string }, st: HostState) => void; error: string }) {
  const [mode, setMode] = useState<'create' | 'enter'>('create');
  const [pin, setPin] = useState('');
  const [code, setCode] = useState('');
  const [err, setErr] = useState(error);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    const r =
      mode === 'create'
        ? await call<{ code: string; state: HostState }>('host:create', { pin })
        : await call<{ code: string; state: HostState }>('host:auth', { code, pin });
    setBusy(false);
    if (!r.ok) return setErr(r.error ?? 'Error');
    syncClock(r.data!.state.public.serverNow);
    onReady({ code: r.data!.code, pin }, r.data!.state);
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 py-8">
      <div className="text-center">
        <Logo size="lg" />
        <p className="mt-2 text-white/80">Panel del presentador</p>
      </div>
      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-white/5 p-1" role="tablist">
        {(['create', 'enter'] as const).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={`min-h-12 rounded-xl font-bold ${mode === m ? 'bg-turq text-deepest' : 'text-white/80'}`}
          >
            {m === 'create' ? 'Crear sala nueva' : 'Entrar a mi sala'}
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="flex flex-col gap-4 rounded-3xl bg-deeper/80 p-5 ring-1 ring-white/10">
        {mode === 'enter' && (
          <label className="flex flex-col gap-1.5">
            <span className="font-semibold">Código de sala</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
              required
              className="min-h-14 rounded-2xl bg-white px-4 text-center text-2xl font-black tracking-[0.3em] text-deepest"
            />
          </label>
        )}
        <label className="flex flex-col gap-1.5">
          <span className="font-semibold">{mode === 'create' ? 'Elige un PIN de host (4–8 dígitos)' : 'PIN de host'}</span>
          <input
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
            required
            minLength={4}
            className="min-h-14 rounded-2xl bg-white px-4 text-center text-2xl font-black tracking-[0.4em] text-deepest"
          />
          {mode === 'create' && <span className="text-xs text-white/60">Guárdalo: lo necesitas para volver a entrar al panel y exportar resultados.</span>}
        </label>
        <ErrorText>{err}</ErrorText>
        <Button type="submit" disabled={busy || pin.length < 4 || (mode === 'enter' && code.length !== 6)}>
          {busy ? 'Un momento…' : mode === 'create' ? 'Crear sala' : 'Entrar'}
        </Button>
      </form>
    </main>
  );
}

// ---------- Panel de control ----------
type Tab = 'control' | 'questions' | 'players';

function HostPanel({ hs, pin, connected, onLogout }: { hs: HostState; pin: string; connected: boolean; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>('control');
  const [error, setError] = useState('');
  const pub = hs.public;
  const origin = window.location.origin;
  const joinUrl = `${origin}/join/${pub.code}`;
  const screenUrl = `${origin}/screen/${pub.code}`;

  const act = useCallback(async (action: string, payload?: Record<string, unknown>) => {
    setError('');
    const r = await call('host:action', { action, payload });
    if (!r.ok) setError(r.error ?? 'Error');
    return r;
  }, []);

  const exportCsv = async () => {
    const res = await fetch(`/api/rooms/${pub.code}/results.csv`, { headers: { 'x-host-pin': pin } });
    if (!res.ok) return setError('No se pudo exportar el CSV.');
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `channel-challenge-${pub.code}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-4">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Logo size="md" />
          <ConnectionDot connected={connected} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a href={screenUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-12 items-center rounded-2xl bg-sun px-4 font-bold text-deepest">
            🖥️ Abrir vista Pantalla
          </a>
          <Button variant="ghost" onClick={exportCsv}>
            ⬇️ Exportar CSV
          </Button>
          <Button variant="ghost" onClick={onLogout}>
            Salir
          </Button>
        </div>
      </header>

      <div className="mb-4 grid gap-4 md:grid-cols-[auto_1fr]">
        <Card className="flex items-center gap-4">
          <Qr url={joinUrl} size={112} />
          <div>
            <div className="text-sm text-white/70">Código de sala</div>
            <div className="text-4xl font-black tracking-[0.2em] text-sun">{pub.code}</div>
            <div className="mt-1 break-all text-xs text-white/60">{joinUrl}</div>
          </div>
        </Card>
        <Card className="grid grid-cols-3 gap-3 text-center">
          <Stat label="Jugadores" value={fmt(pub.playersCount)} />
          <Stat label="Conectados" value={fmt(pub.connectedCount)} />
          <Stat label="Estado" value={STATE_LABEL[pub.state]} small />
        </Card>
      </div>

      <nav className="mb-4 flex gap-2" role="tablist">
        {(
          [
            ['control', '🎛️ Control'],
            ['questions', '📝 Preguntas'],
            ['players', `👥 Jugadores (${hs.players.length})`],
          ] as [Tab, string][]
        ).map(([t, l]) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`min-h-12 rounded-2xl px-4 font-bold ${tab === t ? 'bg-turq text-deepest' : 'bg-white/10'}`}
          >
            {l}
          </button>
        ))}
      </nav>

      <div className="mb-3">
        <ErrorText>{error}</ErrorText>
      </div>

      {tab === 'control' && <ControlTab hs={hs} act={act} />}
      {tab === 'questions' && <AdminEditor act={act} />}
      {tab === 'players' && <PlayersTab hs={hs} act={act} />}
    </div>
  );
}

function Stat({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div>
      <div className="text-sm text-white/70">{label}</div>
      <div className={`font-black text-turq ${small ? 'text-xl leading-8' : 'text-4xl'}`}>{value}</div>
    </div>
  );
}

type Act = (action: string, payload?: Record<string, unknown>) => Promise<{ ok: boolean }>;

function ControlTab({ hs, act }: { hs: HostState; act: Act }) {
  const pub = hs.public;
  const s = pub.state;
  const q = hs.currentQuestion;
  const preview = s === 'phase_intro' || s === 'ready' ? q : null;
  const [time, setTime] = useState<number>(q?.timeLimit ?? hs.defaultTime);
  useEffect(() => setTime(q?.timeLimit ?? hs.defaultTime), [q?.id, q?.timeLimit, hs.defaultTime]);
  const left = useCountdown(pub.closesAt, s === 'open');

  const nextLabel =
    s === 'phase_end'
      ? hs.hasNextPhase
        ? 'Siguiente fase'
        : 'Ver podio final'
      : s === 'revealed' || s === 'leaderboard'
        ? hs.isLastQuestionInPhase
          ? 'Cerrar fase'
          : 'Siguiente pregunta'
        : 'Siguiente';

  const buttons: { label: string; action: string; enabled: boolean; payload?: Record<string, unknown> }[] = [
    { label: '▶ Iniciar fase', action: 'startPhase', enabled: (s === 'lobby' || s === 'phase_end') && hs.hasNextPhase },
    { label: '❓ Abrir pregunta', action: 'openQuestion', enabled: s === 'phase_intro' || s === 'ready', payload: { timeLimit: time } },
    { label: '🔒 Cerrar apuestas', action: 'lock', enabled: s === 'open' },
    { label: '✨ Revelar', action: 'reveal', enabled: s === 'locked' },
    { label: '🏆 Ver ranking', action: 'leaderboard', enabled: s === 'revealed' },
    { label: `⏭ ${nextLabel}`, action: 'next', enabled: s === 'revealed' || s === 'leaderboard' || (s === 'phase_end' && !hs.hasNextPhase) },
  ];
  const recommended = buttons.findIndex((b) => b.enabled && !(b.action === 'next' && s === 'revealed'));
  const rec = recommended >= 0 ? buttons[recommended] : null;
  const lastRun = useRef(0);
  const runRec = useCallback(() => {
    // Antirrebote: evita saltarse un paso con doble clic o doble pulsación del clicker.
    if (!rec || Date.now() - lastRun.current < 700) return;
    lastRun.current = Date.now();
    void act(rec.action, rec.payload);
  }, [rec, act]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName ?? '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      // Espacio, flecha derecha o PageDown (los clickers de presentación envían PageDown / flecha)
      if (e.code === 'Space' || e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        runRec();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [runRec]);

  const confirmReset = () => {
    if (confirm('¿Reiniciar la partida? Se borran todas las respuestas y todos vuelven a 1.000 puntos.')) void act('resetGame');
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      <div className="flex flex-col gap-4">
        <button
          onClick={runRec}
          disabled={!rec}
          className="flex min-h-24 w-full flex-wrap items-center justify-between gap-2 rounded-3xl bg-pink px-6 py-4 text-left text-white shadow-xl transition hover:brightness-110 active:scale-[0.99] disabled:bg-white/10 disabled:text-white/50"
        >
          <span>
            <span className="block text-sm font-semibold uppercase tracking-wider opacity-85">Siguiente paso</span>
            <span className="text-3xl font-black">{rec ? rec.label : s === 'finished' ? 'Juego terminado 🎉' : 'Esperando…'}</span>
          </span>
          <span className="rounded-xl bg-black/20 px-3 py-1 text-sm font-semibold">Espacio · → · clicker</span>
        </button>
        <Card>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {pub.phase && <PhaseBadge phase={pub.phase} />}
            {pub.phase && s !== 'lobby' && s !== 'phase_end' && s !== 'finished' && (
              <span className="text-white/80">
                Pregunta {pub.questionIndex + 1} de {pub.phase.questionCount}
              </span>
            )}
            <span className="rounded-full bg-white/10 px-3 py-1 text-sm font-semibold">{STATE_LABEL[s]}</span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {buttons.map((b, i) => (
              <Button
                key={b.action}
                variant={i === recommended ? 'pink' : 'ghost'}
                disabled={!b.enabled}
                onClick={() => act(b.action, b.payload)}
                className={`min-h-16 ${i === recommended ? 'anim-pulse' : ''}`}
              >
                {b.label}
              </Button>
            ))}
          </div>
          <label className="mt-4 flex min-h-12 cursor-pointer items-start gap-3 rounded-2xl bg-white/5 p-3 ring-1 ring-white/15">
            <input
              type="checkbox"
              checked={hs.autoReveal}
              onChange={(e) => act('setAutoReveal', { enabled: e.target.checked })}
              className="mt-0.5 h-6 w-6 shrink-0 accent-[#2EE6C8]"
            />
            <span>
              <b>Modo automático</b>
              <span className="block text-sm text-white/70">
                Cierra la pregunta cuando todos los conectados ya apostaron y revela la respuesta sola al cerrar. Tú solo pasas de pregunta.
              </span>
            </span>
          </label>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2">
              <span className="text-white/80">⏱ Tiempo de la pregunta</span>
              <input
                type="number"
                min={5}
                max={600}
                value={time}
                onChange={(e) => setTime(Number(e.target.value))}
                className="min-h-12 w-24 rounded-xl bg-white px-3 text-lg font-bold text-deepest"
              />
              <span className="text-white/80">s</span>
            </label>
            <label className="flex items-center gap-2">
              <span className="text-white/70 text-sm">Por defecto:</span>
              <input
                type="number"
                min={5}
                max={600}
                defaultValue={hs.defaultTime}
                onBlur={(e) => Number(e.target.value) !== hs.defaultTime && act('setDefaultTime', { seconds: Number(e.target.value) })}
                className="min-h-12 w-20 rounded-xl bg-white/90 px-2 text-deepest"
              />
            </label>
          </div>
        </Card>

        {s === 'open' && (
          <Card className="flex items-center gap-6">
            <CountdownRing left={left} total={pub.question?.timeLimit ?? 40} size={110} />
            <div className="flex-1">
              <div className="text-4xl font-black tabular-nums">
                {fmt(pub.answeredCount)} <span className="text-white/60">/ {fmt(pub.playersCount)}</span>
              </div>
              <div className="mb-2 text-white/70">jugadores ya respondieron</div>
              <ProgressBar value={pub.answeredCount} max={pub.playersCount} />
            </div>
          </Card>
        )}

        {(q || preview) && s !== 'lobby' && (
          <Card>
            <div className="mb-2 flex items-center gap-2">
              <TypeBadge type={(q ?? preview)!.type} />
              {s === 'phase_intro' || s === 'ready' ? <span className="text-sm text-sun">Vista previa (aún no visible para los jugadores)</span> : null}
            </div>
            <QuestionDetail q={(q ?? preview)!} />
          </Card>
        )}

        {s === 'revealed' && pub.reveal && (
          <Card>
            <div className="mb-2 font-bold">Resultado de la sala</div>
            <div className="mb-3 text-white/80">
              Acertó el {fmt(pub.reveal.correctPct)}% de {fmt(pub.reveal.respondents)} respuestas
              {pub.reveal.roomAverage !== undefined && ` · promedio de la sala: ${fmt(pub.reveal.roomAverage)}`}
            </div>
            <div className="flex flex-col gap-2">
              {pub.reveal.bars.map((b) => (
                <div key={b.label} className="flex items-center gap-2 text-sm">
                  <span className="w-48 truncate">{b.label}</span>
                  <div className="h-4 flex-1 rounded-full bg-white/10">
                    <div className={`h-full rounded-full ${b.correct ? 'bg-turq' : 'bg-pink'}`} style={{ width: `${b.pct}%` }} />
                  </div>
                  <span className="w-14 text-right tabular-nums">{fmt(b.pct)}%</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {(s === 'lobby' || s === 'phase_end') && hs.nextQuestion && (
          <Card>
            <div className="mb-1 text-sm text-white/70">Primera pregunta de la siguiente fase</div>
            <QuestionDetail q={hs.nextQuestion} />
          </Card>
        )}
      </div>

      <aside className="flex flex-col gap-4">
        <Card>
          <div className="mb-2 font-bold">🤖 Modo demo</div>
          <p className="mb-3 text-sm text-white/70">Agrega bots que responden al azar para probar el flujo sin público.</p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="ghost" onClick={() => act('addBots', { count: 20 })}>
              + 20 bots
            </Button>
            <Button variant="ghost" onClick={() => act('removeBots')} disabled={!hs.players.some((p) => p.isBot)}>
              Quitar bots
            </Button>
          </div>
        </Card>
        <Card>
          <div className="mb-2 font-bold">Top 5 en vivo</div>
          <ol className="flex flex-col gap-1">
            {hs.players.slice(0, 5).map((p, i) => (
              <li key={p.id} className="flex justify-between gap-2">
                <span className="truncate">
                  {i + 1}. {p.nickname}
                </span>
                <span className="font-bold text-turq tabular-nums">{fmt(p.balance)}</span>
              </li>
            ))}
            {!hs.players.length && <li className="text-white/60">Aún no hay jugadores.</li>}
          </ol>
        </Card>
        <Card>
          <div className="mb-2 font-bold">Partida</div>
          <Button variant="danger" className="w-full" onClick={confirmReset}>
            ↺ Reiniciar partida
          </Button>
        </Card>
      </aside>
    </div>
  );
}

function QuestionDetail({ q }: { q: NonNullable<HostState['currentQuestion']> }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xl font-bold">{q.prompt}</p>
      {q.options.length > 0 && (
        <div className="text-sm text-white/80">
          {q.type === 'ranking' ? 'Ítems: ' : 'Opciones: '}
          {q.options.join(' · ')}
        </div>
      )}
      <div className="rounded-xl bg-turq/15 p-3 ring-1 ring-turq/50">
        <span className="text-sm text-white/70">Respuesta correcta: </span>
        <b>{answerLabel(q.answer, q.unit)}</b>
        <span className="ml-2 text-sm text-white/70">
          · x{fmt(q.multiplier)} · {q.timeLimit}s
        </span>
      </div>
      <div className="rounded-xl bg-sun/15 p-3 ring-1 ring-sun/60">
        <div className="text-sm font-bold text-sun">🗒️ Nota del presentador</div>
        <p>{q.hostNote}</p>
      </div>
      <div className="rounded-xl bg-white/5 p-3 text-sm">
        <div className="font-bold text-white/80">Lo que dice la data (se muestra al revelar)</div>
        <p className="text-white/80">{q.reveal}</p>
      </div>
    </div>
  );
}

function PlayersTab({ hs, act }: { hs: HostState; act: Act }) {
  const [filter, setFilter] = useState('');
  const list = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return f ? hs.players.filter((p) => p.nickname.toLowerCase().includes(f) || (p.team ?? '').toLowerCase().includes(f)) : hs.players;
  }, [hs.players, filter]);
  const kick = (id: string, nick: string) => {
    if (confirm(`¿Expulsar a “${nick}”? No podrá volver a entrar con ese apodo.`)) void act('kick', { playerId: id });
  };
  return (
    <Card>
      <input
        placeholder="Buscar apodo o equipo…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="mb-3 min-h-12 w-full rounded-xl bg-white px-3 text-deepest"
      />
      <div className="max-h-[60vh] overflow-auto">
        <table className="w-full text-left">
          <thead className="sticky top-0 bg-deeper text-sm text-white/70">
            <tr>
              <th className="p-2">#</th>
              <th className="p-2">Apodo</th>
              <th className="p-2">Equipo</th>
              <th className="p-2 text-right">Saldo</th>
              <th className="p-2">Estado</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id} className="border-t border-white/10">
                <td className="p-2 tabular-nums">{hs.players.indexOf(p) + 1}</td>
                <td className="p-2 font-semibold">
                  {p.nickname} {p.isBot && <span className="text-xs text-white/60">(bot)</span>}
                </td>
                <td className="p-2 text-white/80">{p.team ?? '—'}</td>
                <td className="p-2 text-right font-bold tabular-nums">{fmt(p.balance)}</td>
                <td className="p-2 text-sm">
                  {p.connected ? '● en línea' : '○ desconectado'}
                  {hs.public.state === 'open' && (p.answered ? ' · ✔ respondió' : ' · … pendiente')}
                </td>
                <td className="p-2 text-right">
                  <button onClick={() => kick(p.id, p.nickname)} className="min-h-10 rounded-lg px-3 text-sm font-bold text-pink ring-1 ring-pink hover:bg-pink hover:text-white">
                    Expulsar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.length && <p className="p-4 text-center text-white/60">Sin jugadores.</p>}
      </div>
    </Card>
  );
}

