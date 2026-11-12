import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { minBet, PlayerState, PublicQuestion, PublicState } from '../../../shared/types.ts';
import { BetPicker, NumericInput, RankingInput } from '../components/PlayerInputs.tsx';
import { Button, Card, ConnectionDot, CountdownRing, ErrorText, Logo, PhaseBadge, TypeBadge } from '../components/ui.tsx';
import { answerLabel, fmt, fmtSigned, fmtUnit, PHASE_COLORS, TYPE_META } from '../lib/format.ts';
import { syncClock, useCountdown } from '../lib/hooks.ts';
import { clearSession, getSession } from '../lib/session.ts';
import { call, socket } from '../lib/socket.ts';

export function Play() {
  const nav = useNavigate();
  const [state, setState] = useState<PublicState | null>(null);
  const [me, setMe] = useState<PlayerState | null>(null);
  const [connected, setConnected] = useState(socket.connected);
  const [kicked, setKicked] = useState(false);
  const [fatal, setFatal] = useState('');

  const resume = useCallback(async () => {
    const s = getSession();
    if (!s) return nav('/', { replace: true });
    const r = await call<{ state: PublicState; me: PlayerState }>('player:resume', { token: s.token });
    if (!r.ok) {
      if (r.error === 'Sesión no válida.') {
        clearSession();
        setFatal('Tu sesión ya no es válida. Vuelve a entrar con el código de la sala.');
      }
      return;
    }
    syncClock(r.data!.state.serverNow);
    setState(r.data!.state);
    setMe(r.data!.me);
  }, [nav]);

  useEffect(() => {
    const onState = (s: PublicState) => {
      syncClock(s.serverNow);
      setState(s);
    };
    const onCount = (c: Pick<PublicState, 'answeredCount' | 'playersCount' | 'connectedCount'>) =>
      setState((s) => (s ? { ...s, ...c } : s));
    const onMe = (m: PlayerState) => setMe(m);
    const onConnect = () => {
      setConnected(true);
      void resume(); // reconexión automática: recupera saldo y estado
    };
    const onDisconnect = () => setConnected(false);
    const onKicked = () => {
      clearSession();
      setKicked(true);
    };
    socket.on('state', onState);
    socket.on('count', onCount);
    socket.on('me', onMe);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('kicked', onKicked);
    if (socket.connected) void resume();
    return () => {
      socket.off('state', onState);
      socket.off('count', onCount);
      socket.off('me', onMe);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('kicked', onKicked);
    };
  }, [resume]);

  if (kicked)
    return (
      <Center>
        <div className="text-6xl">🚫</div>
        <h1 className="text-2xl font-black">El presentador te retiró de la sala</h1>
        <Button onClick={() => nav('/')}>Volver al inicio</Button>
      </Center>
    );
  if (fatal)
    return (
      <Center>
        <ErrorText>{fatal}</ErrorText>
        <Button onClick={() => nav('/')}>Entrar de nuevo</Button>
      </Center>
    );
  if (!state || !me)
    return (
      <Center>
        <Logo />
        <p className="animate-pulse text-white/80">Conectando con la sala…</p>
      </Center>
    );

  const phaseColor = state.phase ? PHASE_COLORS[state.phase.color]?.hex : undefined;

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-deepest/90 px-4 py-3 backdrop-blur" style={{ borderTop: phaseColor ? `4px solid ${phaseColor}` : undefined }}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate font-bold">{me.nickname}</div>
            <ConnectionDot connected={connected} />
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wider text-white/70">Saldo</div>
            <div className="text-3xl font-black text-sun tabular-nums" aria-live="polite">
              {fmt(me.balance)}
            </div>
          </div>
        </div>
        {me.rank > 0 && state.state !== 'lobby' && (
          <div className="mt-1 text-right text-xs text-white/70">
            Puesto #{me.rank} de {fmt(me.totalPlayers)}
          </div>
        )}
      </header>
      <main className="flex flex-1 flex-col gap-4 px-4 py-5">
        <Body state={state} me={me} setMe={setMe} />
      </main>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-5 px-4 text-center">{children}</main>;
}

function Body({ state, me, setMe }: { state: PublicState; me: PlayerState; setMe: (m: PlayerState) => void }) {
  const s = state.state;
  if (s === 'lobby')
    return (
      <Waiting icon="🎉" title="¡Estás dentro!">
        Mira la pantalla del presentador. El juego empieza en un momento. Hay <b>{fmt(state.playersCount)}</b> jugadores en la sala.
      </Waiting>
    );

  if (s === 'phase_intro' && state.phase)
    return (
      <div className="anim-pop flex flex-col gap-4">
        <PhaseBadge phase={state.phase} />
        <h1 className="text-3xl font-black leading-tight">{state.phase.title}</h1>
        {state.phase.channels.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {state.phase.channels.map((c) => (
              <span key={c} className="rounded-full bg-white/10 px-3 py-1 text-sm font-semibold ring-1 ring-white/20">
                {c}
              </span>
            ))}
          </div>
        )}
        <p className="text-lg text-white/85">“{state.phase.phrase}”</p>
        {me.rescuedInPhase === state.phase.id && (
          <Card className="bg-sun/15 ring-sun">
            <b>🛟 ¡Rescate!</b> Tu saldo era menor a 100 y se recargó a 300 puntos para que sigas en el juego.
          </Card>
        )}
        <p className="text-center text-white/70">Prepárate: en esta fase todo vale x{fmt(state.phase.multiplier)}.</p>
      </div>
    );

  if (s === 'ready')
    return (
      <Waiting icon={state.teaserType ? TYPE_META[state.teaserType].icon : '⏳'} title="Viene una pregunta">
        {state.teaserType && <TypeBadge type={state.teaserType} />}
        <div className="mt-2">Pregunta {state.questionIndex + 1} de {state.phase?.questionCount}</div>
      </Waiting>
    );

  if ((s === 'open' || s === 'locked') && state.question) {
    const q = state.question;
    if (me.myAnswer && me.myAnswer.questionId === q.id)
      return (
        <div className="flex flex-col items-center gap-5 text-center">
          <Timer state={state} />
          <div className="text-6xl">🔒</div>
          <h2 className="text-2xl font-black">Apuesta registrada</h2>
          <Card className="w-full">
            <div className="text-white/70">Tu respuesta</div>
            <div className="text-xl font-bold"><AnswerView value={me.myAnswer.value} unit={q.unit} /></div>
            <div className="mt-2 text-white/70">Apostaste</div>
            <div className="text-3xl font-black text-sun">{fmt(me.myAnswer.bet)}</div>
          </Card>
          <p className="text-white/70">{s === 'locked' ? 'Apuestas cerradas. ¡Atento a la revelación!' : 'Esperando a que cierre la ronda…'}</p>
        </div>
      );
    if (s === 'locked')
      return (
        <Waiting icon="⏰" title="Se acabó el tiempo">
          No alcanzaste a apostar. Pierdes la apuesta mínima ({fmt(minBet(me.balance))} puntos).
        </Waiting>
      );
    return <AnswerFlow key={q.id} q={q} state={state} me={me} onDone={setMe} />;
  }

  if ((s === 'revealed' || s === 'leaderboard') && state.question) return <ResultCard state={state} me={me} />;

  if (s === 'phase_end')
    return (
      <Waiting icon="🏁" title={`Fin de ${state.phase?.id === 5 ? 'la Pregunta de Oro' : `la fase ${state.phase?.id}`}`}>
        Vas en el puesto <b>#{me.rank}</b> con <b>{fmt(me.balance)}</b> puntos.
      </Waiting>
    );

  if (s === 'finished')
    return (
      <div className="anim-pop flex flex-col items-center gap-4 text-center">
        <div className="text-7xl">{me.rank === 1 ? '🏆' : me.rank <= 3 ? '🥇' : '🎊'}</div>
        <h1 className="text-3xl font-black">¡Juego terminado!</h1>
        <Card className="w-full">
          <div className="text-white/70">Tu posición final</div>
          <div className="text-6xl font-black text-sun">#{me.rank}</div>
          <div className="text-white/70">de {fmt(me.totalPlayers)} jugadores</div>
          <div className="mt-3 text-3xl font-black text-turq">{fmt(me.balance)} puntos</div>
        </Card>
        <p className="text-white/80">Gracias por jugar The Channel Challenge.</p>
      </div>
    );

  return <Waiting icon="⏳" title="Un momento…" />;
}

function Waiting({ icon, title, children }: { icon: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="anim-pop flex flex-1 flex-col items-center justify-center gap-3 text-center">
      <div className="text-7xl" aria-hidden>
        {icon}
      </div>
      <h1 className="text-3xl font-black">{title}</h1>
      {children && <div className="text-lg text-white/85">{children}</div>}
    </div>
  );
}

function Timer({ state }: { state: PublicState }) {
  const left = useCountdown(state.closesAt, state.state === 'open');
  if (state.state !== 'open') return null;
  return <CountdownRing left={left} total={state.question?.timeLimit ?? 40} size={84} />;
}

// ---------- Flujo de respuesta: 1) respuesta → 2) apuesta → 3) confirmar ----------
function AnswerFlow({ q, state, me, onDone }: { q: PublicQuestion; state: PublicState; me: PlayerState; onDone: (m: PlayerState) => void }) {
  const min = minBet(me.balance);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [value, setValue] = useState<unknown>(() =>
    q.type === 'ranking' ? [...q.options] : q.type === 'numeric' ? defaultNumeric(q) : null,
  );
  const [bet, setBet] = useState(min);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const left = useCountdown(state.closesAt, true);

  const choose = (v: unknown) => {
    setValue(v);
    setStep(me.balance > 0 ? 2 : 3);
  };
  const confirm = async () => {
    setBusy(true);
    setError('');
    const r = await call<PlayerState>('player:answer', { questionId: q.id, value, bet: me.balance > 0 ? bet : 0, token: getSession()?.token });
    setBusy(false);
    if (!r.ok) return setError(r.error ?? 'No se pudo registrar.');
    onDone(r.data!);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <TypeBadge type={q.type} />
          <Steps step={step} />
        </div>
        <CountdownRing left={left} total={q.timeLimit} size={76} />
      </div>
      <h1 className="text-xl font-bold leading-snug">{q.prompt}</h1>

      {step === 1 && (
        <>
          {q.type === 'mito_realidad' && (
            <div className="grid grid-cols-2 gap-3">
              {(['MITO', 'REALIDAD'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => choose(v)}
                  className={`flex min-h-36 flex-col items-center justify-center gap-2 rounded-3xl text-2xl font-black ring-2 active:scale-95 ${
                    v === 'MITO' ? 'bg-pink text-white ring-pink' : 'bg-turq text-deepest ring-turq'
                  }`}
                >
                  <span className="text-4xl" aria-hidden>
                    {v === 'MITO' ? '✗' : '✓'}
                  </span>
                  {v === 'MITO' ? 'MITO' : 'REALIDAD'}
                </button>
              ))}
            </div>
          )}
          {q.type === 'intruso' && (
            <div className="flex flex-col gap-3">
              {q.options.map((o, i) => (
                <button
                  key={o}
                  onClick={() => choose(o)}
                  className="flex min-h-16 items-center gap-3 rounded-2xl bg-white/10 px-4 py-3 text-left text-lg font-bold ring-1 ring-white/25 active:scale-[0.98] active:bg-turq/30"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sun font-black text-deepest">
                    {String.fromCharCode(65 + i)}
                  </span>
                  {o}
                </button>
              ))}
            </div>
          )}
          {q.type === 'ranking' && (
            <>
              <p className="text-sm text-white/70">Arrastra o usa ↑↓. Arriba = mayor.</p>
              <RankingInput items={value as string[]} onChange={setValue} />
              <Button onClick={() => choose(value)} className="mt-1">
                Listo, siguiente →
              </Button>
            </>
          )}
          {q.type === 'numeric' && (
            <>
              <NumericInput
                value={value as number}
                onChange={setValue}
                min={q.min ?? 0}
                max={q.max ?? 100}
                step={q.step ?? 1}
                unit={q.unit}
              />
              <Button onClick={() => choose(value)} className="mt-1">
                Listo, siguiente →
              </Button>
            </>
          )}
        </>
      )}

      {step === 2 && (
        <>
          <BetPicker balance={me.balance} min={min} bet={bet} onChange={setBet} multiplier={q.multiplier} type={q.type} />
          <div className="grid grid-cols-[auto_1fr] gap-3">
            <Button variant="ghost" onClick={() => setStep(1)}>
              ← Atrás
            </Button>
            <Button onClick={() => setStep(3)}>Siguiente →</Button>
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <Card>
            <div className="text-sm text-white/70">Tu respuesta</div>
            <div className="text-xl font-bold"><AnswerView value={value} unit={q.unit} /></div>
            <div className="mt-3 text-sm text-white/70">Tu apuesta</div>
            <div className="text-4xl font-black text-sun">{me.balance > 0 ? fmt(bet) : '0'}</div>
            {bet === me.balance && me.balance > 0 && <div className="mt-1 font-bold text-pink">🔥 ¡ALL-IN!</div>}
            {me.balance === 0 && <div className="mt-1 text-sm text-white/70">Tu saldo es 0: juegas por el bono y por el rescate de la próxima fase.</div>}
          </Card>
          <ErrorText>{error}</ErrorText>
          <div className="grid grid-cols-[auto_1fr] gap-3">
            <Button variant="ghost" onClick={() => setStep(me.balance > 0 ? 2 : 1)} disabled={busy}>
              ← Cambiar
            </Button>
            <Button variant="pink" onClick={confirm} disabled={busy} className="min-h-14 text-xl">
              {busy ? 'Enviando…' : 'Confirmar apuesta'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function defaultNumeric(q: PublicQuestion) {
  const lo = q.min ?? 0;
  const hi = q.max ?? 100;
  const step = q.step ?? 1;
  return Math.round((lo + hi) / 2 / step) * step;
}

function Steps({ step }: { step: number }) {
  const labels = ['Respuesta', 'Apuesta', 'Confirmar'];
  return (
    <ol className="flex gap-1 text-xs font-semibold" aria-label={`Paso ${step} de 3`}>
      {labels.map((l, i) => (
        <li key={l} className={`rounded-full px-2 py-0.5 ${i + 1 === step ? 'bg-sun text-deepest' : i + 1 < step ? 'bg-turq/30' : 'bg-white/10 text-white/60'}`}>
          {i + 1}. {l}
        </li>
      ))}
    </ol>
  );
}

function ResultCard({ state, me }: { state: PublicState; me: PlayerState }) {
  const q = state.question!;
  const r = me.myResult;
  const reveal = state.reveal;
  if (!r || r.questionId !== q.id)
    return (
      <Waiting icon="👀" title="Mira la pantalla">
        Te uniste después de esta pregunta. ¡Juegas desde la siguiente!
      </Waiting>
    );
  const total = r.delta + r.bonus;
  const tone = total > 0 ? 'win' : total < 0 ? 'lose' : 'even';
  return (
    <div className="anim-pop flex flex-col gap-4">
      <div
        className={`rounded-3xl p-6 text-center ${
          tone === 'win' ? 'bg-turq text-deepest' : tone === 'lose' ? 'bg-pink text-white' : 'bg-white/15'
        }`}
      >
        <div className="text-5xl" aria-hidden>
          {tone === 'win' ? '🎉' : tone === 'lose' ? '😬' : '🤝'}
        </div>
        <div className="text-2xl font-black">
          {!r.answered ? 'No respondiste' : tone === 'win' ? '¡Ganaste!' : tone === 'lose' ? 'Perdiste' : 'Recuperas tu apuesta'}
        </div>
        <div className="text-6xl font-black tabular-nums">{fmtSigned(total)}</div>
        {r.bonus > 0 && <div className="mt-1 font-bold">Incluye 🎯 bono +{r.bonus} por ser el más cercano</div>}
      </div>
      <Card>
        <div className="text-sm text-white/70">Respuesta correcta</div>
        <div className="text-xl font-bold">
          {reveal ? <AnswerView value={reveal.correctAnswer} unit={q.unit} /> : '—'}
        </div>
        {me.myAnswer && me.myAnswer.questionId === q.id && (
          <div className="mt-2 text-sm text-white/70">
            Tu respuesta: <AnswerView value={me.myAnswer.value} unit={q.unit} small compare={Array.isArray(reveal?.correctAnswer) ? (reveal!.correctAnswer as string[]) : undefined} />
          </div>
        )}
      </Card>
      {reveal && (
        <Card className="bg-white text-deepest">
          <div className="text-sm font-black uppercase text-pink">📊 Lo que dice la data</div>
          <p className="mt-1 font-semibold">{reveal.reveal}</p>
          {q.type === 'numeric' && reveal.roomAverage !== undefined && (
            <p className="mt-2 text-sm">Promedio de la sala: {fmtUnit(reveal.roomAverage, q.unit)}</p>
          )}
        </Card>
      )}
      <div className="text-center text-lg">
        Vas en el puesto <b className="text-sun">#{me.rank}</b> de {fmt(me.totalPlayers)}
      </div>
    </div>
  );
}

/** Muestra una respuesta; en Ranking, como lista numerada (con ✔/✗ si se compara con el orden real). */
function AnswerView({ value, unit, small, compare }: { value: unknown; unit: string | null; small?: boolean; compare?: string[] }) {
  if (!Array.isArray(value)) return <span className={small ? 'font-semibold text-white' : ''}>{answerLabel(value, unit)}</span>;
  return (
    <ol className={`mt-1 flex flex-col gap-0.5 ${small ? 'text-base font-semibold text-white' : ''}`}>
      {(value as string[]).map((v, i) => (
        <li key={v} className="flex gap-2">
          <span className="w-6 text-sun">{i + 1}.</span>
          <span className="flex-1">{v}</span>
          {compare && <span aria-label={compare[i] === v ? 'posición correcta' : 'posición incorrecta'}>{compare[i] === v ? '✔' : '✗'}</span>}
        </li>
      ))}
    </ol>
  );
}
