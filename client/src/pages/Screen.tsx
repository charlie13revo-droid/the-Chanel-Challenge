import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { PublicState } from '../../../shared/types.ts';
import { Leaderboard } from '../components/Leaderboard.tsx';
import { Podium } from '../components/Podium.tsx';
import { RevealView } from '../components/RevealView.tsx';
import { CountdownRing, Logo, PhaseBadge, Qr, TypeBadge } from '../components/ui.tsx';
import { fmt, fmtUnit, PHASE_COLORS, TYPE_META } from '../lib/format.ts';
import { syncClock, useCountdown } from '../lib/hooks.ts';
import { call, socket } from '../lib/socket.ts';
import { isMuted, setMuted, sfx } from '../lib/sound.ts';

const W = 1920;
const H = 1080;

/** Escenario fijo 1920×1080 escalado a la ventana: se ve igual al compartir en Teams. */
function Stage({ children }: { children: ReactNode }) {
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / W, window.innerHeight / H));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  return (
    <div className="fixed inset-0 flex items-center justify-center overflow-hidden bg-deepest">
      <div
        className="relative shrink-0 overflow-hidden bg-deep"
        style={{
          width: W,
          height: H,
          transform: `scale(${scale})`,
          backgroundImage:
            'radial-gradient(1400px 800px at 90% -10%, rgba(46,230,200,0.18), transparent 60%), radial-gradient(1000px 700px at -10% 110%, rgba(229,25,94,0.16), transparent 60%)',
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function Screen() {
  const { code = '' } = useParams();
  const [state, setState] = useState<PublicState | null>(null);
  const [error, setError] = useState('');
  const [muted, setMutedState] = useState(isMuted());

  useEffect(() => {
    const watch = async () => {
      const r = await call<PublicState>('screen:watch', { code });
      if (!r.ok) return setError(r.error ?? 'Sala no encontrada');
      syncClock(r.data!.serverNow);
      setState(r.data!);
    };
    const onState = (s: PublicState) => {
      syncClock(s.serverNow);
      setState(s);
    };
    const onCount = (c: Partial<PublicState>) => setState((s) => (s ? { ...s, ...c } : s));
    socket.on('state', onState);
    socket.on('count', onCount);
    socket.on('connect', watch);
    if (socket.connected) void watch();
    return () => {
      socket.off('state', onState);
      socket.off('count', onCount);
      socket.off('connect', watch);
    };
  }, [code]);

  // Sonidos en cada cambio de estado.
  const prev = useRef<string | null>(null);
  useEffect(() => {
    if (!state) return;
    const key = `${state.state}:${state.question?.id ?? ''}:${state.phase?.id ?? ''}`;
    if (prev.current && prev.current !== key) {
      if (state.state === 'open') sfx.open();
      else if (state.state === 'locked') sfx.lock();
      else if (state.state === 'revealed') sfx.reveal();
      else if (state.state === 'finished') sfx.fanfare();
      else sfx.whoosh();
    }
    prev.current = key;
  }, [state]);

  if (error)
    return (
      <Stage>
        <div className="flex h-full flex-col items-center justify-center gap-6">
          <Logo size="xl" />
          <p className="text-4xl">{error}</p>
        </div>
      </Stage>
    );
  if (!state)
    return (
      <Stage>
        <div className="flex h-full items-center justify-center">
          <Logo size="xl" />
        </div>
      </Stage>
    );

  const accent = state.phase ? PHASE_COLORS[state.phase.color]?.hex : '#2EE6C8';
  const joinUrl = `${window.location.origin}/join/${state.code}`;

  return (
    <Stage>
      <div className="absolute inset-x-0 top-0 h-3" style={{ background: accent }} />
      <header className="flex h-[120px] items-center justify-between px-16 pt-4">
        <Logo size="lg" />
        <div className="flex items-center gap-6">
          {state.phase && state.state !== 'lobby' && state.state !== 'finished' && <PhaseBadge phase={state.phase} large />}
          {state.state !== 'lobby' && (
            <div className="rounded-2xl bg-white/10 px-5 py-2 text-2xl font-bold ring-1 ring-white/20">
              Sala <span className="tracking-widest text-sun">{state.code}</span>
            </div>
          )}
          <button
            onClick={() => {
              setMuted(!muted);
              setMutedState(!muted);
            }}
            className="h-14 w-14 rounded-full bg-white/10 text-2xl ring-1 ring-white/20 hover:bg-white/20"
            aria-label={muted ? 'Activar sonido' : 'Silenciar'}
            title={muted ? 'Activar sonido' : 'Silenciar'}
          >
            {muted ? '🔇' : '🔊'}
          </button>
        </div>
      </header>
      <main className="absolute inset-x-16 top-[140px] bottom-12">
        <ScreenBody state={state} joinUrl={joinUrl} />
      </main>
    </Stage>
  );
}

function ScreenBody({ state, joinUrl }: { state: PublicState; joinUrl: string }) {
  const s = state.state;

  if (s === 'lobby')
    return (
      <div className="grid h-full grid-cols-[560px_1fr] gap-14">
        <div className="flex flex-col items-center justify-center gap-6 rounded-[2.5rem] bg-deeper/80 p-10 ring-1 ring-white/10">
          <Qr url={joinUrl} size={400} />
          <div className="text-center">
            <div className="text-2xl text-white/80">Entra en</div>
            <div className="text-3xl font-bold">{joinUrl.replace(/^https?:\/\//, '').replace(/\/join\/.*/, '')}</div>
            <div className="mt-2 text-2xl text-white/80">con el código</div>
            <div className="text-8xl font-black tracking-[0.18em] text-sun">{state.code}</div>
          </div>
        </div>
        <div className="flex min-h-0 flex-col">
          <div className="mb-6 flex items-baseline gap-5">
            <span className="text-[9rem] leading-none font-black text-turq tabular-nums">{fmt(state.playersCount)}</span>
            <span className="text-5xl font-bold">jugadores conectados</span>
          </div>
          <p className="mb-6 text-3xl text-white/80">Antes de cada capítulo, apuesta lo que crees del shopper. Después, la data revela la verdad.</p>
          <div className="flex min-h-0 flex-1 flex-wrap content-start gap-3 overflow-hidden">
            {state.nicknames.map((n, i) => (
              <span
                key={n}
                className="anim-float rounded-full px-5 py-2 text-2xl font-bold ring-1"
                style={{
                  background: ['rgba(46,230,200,.18)', 'rgba(229,25,94,.2)', 'rgba(255,210,63,.18)'][i % 3],
                  borderColor: 'transparent',
                  boxShadow: `inset 0 0 0 1px ${['#2EE6C8', '#E5195E', '#FFD23F'][i % 3]}`,
                }}
              >
                {n}
              </span>
            ))}
          </div>
        </div>
      </div>
    );

  if (s === 'phase_intro' && state.phase) {
    const p = state.phase;
    const c = PHASE_COLORS[p.color];
    const gold = p.id === 5;
    return (
      <div className="flex h-full flex-col items-center justify-center gap-10 text-center">
        <div className="anim-pop text-4xl font-bold uppercase tracking-[0.3em]" style={{ color: c.hex }}>
          {gold ? '★ Gran final ★' : `Capítulo ${p.id}`}
        </div>
        <h1 className={`anim-pop text-[8.5rem] leading-none font-black ${gold ? 'gold-shimmer' : ''}`} style={{ animationDelay: '0.15s' }}>
          {gold ? 'Pregunta de Oro' : p.title}
        </h1>
        {p.channels.length > 0 && (
          <div className="anim-pop flex flex-wrap justify-center gap-4" style={{ animationDelay: '0.35s' }}>
            {p.channels.map((ch) => (
              <span key={ch} className="rounded-full px-8 py-3 text-4xl font-bold" style={{ background: c.hex, color: c.text }}>
                {ch}
              </span>
            ))}
          </div>
        )}
        {p.drivers && (
          <div className="anim-pop text-3xl text-white/80" style={{ animationDelay: '0.5s' }}>
            Motivaciones: <b className="text-white">{p.drivers}</b>
          </div>
        )}
        <p className="anim-pop max-w-[1400px] text-5xl leading-snug font-semibold italic" style={{ animationDelay: '0.65s' }}>
          “{p.phrase}”
        </p>
        <div className="anim-pop rounded-full bg-white/10 px-10 py-4 text-4xl font-black ring-2" style={{ animationDelay: '0.8s', boxShadow: `inset 0 0 0 2px ${c.hex}` }}>
          Multiplicador x{fmt(p.multiplier)} · {p.questionCount} {p.questionCount === 1 ? 'pregunta' : 'preguntas'}
        </div>
      </div>
    );
  }

  if (s === 'ready' && state.teaserType) {
    const t = TYPE_META[state.teaserType];
    return (
      <div className="flex h-full flex-col items-center justify-center gap-8 text-center">
        <div className="anim-pop text-[12rem] leading-none" aria-hidden>
          {t.icon}
        </div>
        <div className="anim-pop text-8xl font-black">{t.label}</div>
        <div className="text-4xl text-white/80">
          Pregunta {state.questionIndex + 1} de {state.phase?.questionCount} · {t.help}
        </div>
      </div>
    );
  }

  if ((s === 'open' || s === 'locked') && state.question) return <QuestionScreen state={state} />;

  if ((s === 'revealed' || s === 'leaderboard') && state.question && state.reveal && s === 'revealed')
    return <RevealView q={state.question} r={state.reveal} />;

  if (s === 'leaderboard' && state.leaderboard)
    return (
      <div className="flex h-full flex-col">
        <h2 className="mb-6 text-6xl font-black">
          🏆 Top 10 <span className="text-3xl font-semibold text-white/70">· {fmt(state.playersCount)} jugadores</span>
        </h2>
        <Leaderboard entries={state.leaderboard} rowHeight={82} />
      </div>
    );

  if (s === 'phase_end' && state.phaseEnd) {
    const pe = state.phaseEnd;
    return (
      <div className="grid h-full grid-cols-[1.35fr_1fr] gap-12">
        <div className="flex flex-col">
          <h2 className="mb-2 text-6xl font-black">Podio de la {pe.phaseId === 5 ? 'Pregunta de Oro' : `fase ${pe.phaseId}`}</h2>
          <p className="mb-6 text-2xl text-white/75">Los que más puntos ganaron en este capítulo</p>
          <div className="flex flex-1 items-end">
            <div className="w-full">
              <Podium items={pe.podium.map((p) => ({ nickname: p.nickname, team: p.team, value: p.gained }))} signed />
            </div>
          </div>
        </div>
        <div className="anim-flip flex flex-col gap-6 self-center rounded-[2.5rem] bg-white p-10 text-deepest" style={{ animationDelay: '1.4s' }}>
          <div className="text-3xl font-black uppercase text-pink">La sala vs. la realidad</div>
          <div>
            <div className="text-2xl font-semibold text-deepest/70">Acierto promedio de la sala</div>
            <div className="text-[7rem] leading-none font-black">{fmt(pe.averageCorrectPct)}%</div>
          </div>
          {pe.worstQuestion && (
            <div>
              <div className="text-2xl font-semibold text-deepest/70">Donde más se equivocó la sala ({fmt(pe.worstQuestion.correctPct)}% de acierto)</div>
              <p className="mt-2 text-3xl leading-snug font-bold">“{pe.worstQuestion.prompt}”</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (s === 'finished' && state.final)
    return (
      <div className="grid h-full grid-cols-[1.25fr_1fr] gap-12">
        <div className="flex flex-col">
          <h2 className="gold-shimmer mb-4 text-8xl font-black">¡Podio final!</h2>
          <div className="flex flex-1 items-end">
            <div className="w-full">
              <Podium items={state.final.podium.map((p) => ({ nickname: p.nickname, team: p.team, value: p.balance }))} withConfetti />
            </div>
          </div>
        </div>
        <div className="flex flex-col justify-center">
          <h3 className="mb-4 text-4xl font-black">Top 10</h3>
          <Leaderboard entries={state.final.top.map((e) => ({ ...e, prevRank: e.rank }))} rowHeight={70} compact />
          <p className="mt-6 text-2xl text-white/75">La pregunta no es dónde compra el shopper, sino qué rol le da a cada canal.</p>
        </div>
      </div>
    );

  return (
    <div className="flex h-full items-center justify-center">
      <Logo size="xl" />
    </div>
  );
}

function QuestionScreen({ state }: { state: PublicState }) {
  const q = state.question!;
  const open = state.state === 'open';
  const left = useCountdown(state.closesAt, open);
  const lastTick = useRef(-1);
  useEffect(() => {
    const sec = Math.ceil(left);
    if (open && sec <= 5 && sec > 0 && sec !== lastTick.current) {
      lastTick.current = sec;
      sfx.tick();
    }
  }, [left, open]);
  const total = Math.max(1, state.playersCount);
  const pct = Math.round((state.answeredCount / total) * 100);

  return (
    <div className="flex h-full flex-col">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <TypeBadge type={q.type} large />
          <span className="text-3xl text-white/75">
            Pregunta {q.order + 1} de {state.phase?.questionCount}
          </span>
        </div>
        {open ? (
          <CountdownRing left={left} total={q.timeLimit} size={170} />
        ) : (
          <div className="anim-pop rounded-3xl bg-pink px-10 py-6 text-5xl font-black">🔒 ¡Apuestas cerradas!</div>
        )}
      </div>
      <h1 className="anim-pop mb-10 text-[4.4rem] leading-[1.12] font-black">{q.prompt}</h1>

      <div className="flex-1">
        {q.type === 'mito_realidad' && (
          <div className="grid grid-cols-2 gap-10">
            <div className="flex items-center justify-center gap-6 rounded-[2rem] bg-pink py-12 text-7xl font-black">✗ MITO</div>
            <div className="flex items-center justify-center gap-6 rounded-[2rem] bg-turq py-12 text-7xl font-black text-deepest">✓ REALIDAD</div>
          </div>
        )}
        {q.type === 'intruso' && (
          <div className="grid grid-cols-2 gap-6">
            {q.options.map((o, i) => (
              <div key={o} className="flex items-center gap-6 rounded-[2rem] bg-white/10 px-8 py-6 ring-2 ring-white/20">
                <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-sun text-5xl font-black text-deepest">
                  {String.fromCharCode(65 + i)}
                </span>
                <span className="text-[2.6rem] leading-tight font-bold">{o}</span>
              </div>
            ))}
          </div>
        )}
        {q.type === 'ranking' && (
          <div className="flex flex-wrap gap-6">
            {q.options.map((o) => (
              <div key={o} className="rounded-[2rem] bg-white/10 px-10 py-7 text-5xl font-bold ring-2 ring-white/20">
                {o}
              </div>
            ))}
            <p className="w-full text-3xl text-white/75">Ordénalos en tu celular de mayor a menor.</p>
          </div>
        )}
        {q.type === 'numeric' && (
          <div className="flex items-center gap-8 text-4xl text-white/85">
            <span className="text-7xl" aria-hidden>
              🎯
            </span>
            <span>
              Responde entre <b className="text-white">{fmtUnit(q.min ?? 0, q.unit)}</b> y <b className="text-white">{fmtUnit(q.max ?? 0, q.unit)}</b>.
              Error ≤5% paga x2 · ≤15% paga x1 · bono +100 al más cercano.
            </span>
          </div>
        )}
      </div>

      <div className="mt-6">
        <div className="mb-3 flex items-baseline justify-between text-3xl">
          <span className="font-bold">% de la sala que ya apostó</span>
          <span className="font-black tabular-nums">
            <span className="text-turq">{pct}%</span>{' '}
            <span className="text-white/70">
              ({fmt(state.answeredCount)} / {fmt(state.playersCount)})
            </span>
          </span>
        </div>
        <div className="h-8 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-turq transition-all duration-700" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}
