import { useCallback, useEffect, useState } from 'react';
import type { FullQuestion, PhaseMeta } from '../../../shared/types.ts';
import { fmt, TYPE_META } from '../lib/format.ts';
import { call } from '../lib/socket.ts';
import { Button, Card, ErrorText, PhaseBadge } from './ui.tsx';

type Q = FullQuestion & { played: boolean };
type Act = (action: string, payload?: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>;

/** Panel de administración: editar fases, preguntas, respuestas y textos antes del evento. */
export function AdminEditor({ act }: { act: Act }) {
  const [bank, setBank] = useState<{ phases: PhaseMeta[]; questions: Q[] } | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const r = await call<{ phases: PhaseMeta[]; questions: Q[] }>('host:bank');
    if (r.ok) setBank(r.data!);
    else setError(r.error ?? 'No se pudo cargar el banco');
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  if (!bank) return <Card>Cargando banco de preguntas…</Card>;

  const restore = async () => {
    if (!confirm('¿Restaurar el banco original? Se pierden todas tus ediciones.')) return;
    const r = await act('restoreBank');
    if (r.ok) void load();
  };

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-white/80">
          Edita los textos y respuestas antes del evento. Las preguntas ya jugadas quedan bloqueadas hasta reiniciar la partida.
        </p>
        <Button variant="danger" onClick={restore}>
          Restaurar banco original
        </Button>
      </Card>
      <ErrorText>{error}</ErrorText>
      {bank.phases.map((p) => (
        <section key={p.id} className="flex flex-col gap-3">
          <PhaseEditor phase={p} act={act} onSaved={load} />
          {bank.questions
            .filter((q) => q.phase === p.id)
            .map((q) => (
              <QuestionEditor key={`${q.id}:${q.prompt}:${JSON.stringify(q.answer)}`} q={q} act={act} onSaved={load} />
            ))}
        </section>
      ))}
    </div>
  );
}

const input = 'min-h-11 w-full rounded-xl bg-white px-3 py-2 text-deepest';
const label = 'flex flex-col gap-1 text-sm font-semibold text-white/85';

function PhaseEditor({ phase, act, onSaved }: { phase: PhaseMeta; act: Act; onSaved: () => void }) {
  const [title, setTitle] = useState(phase.title);
  const [mult, setMult] = useState(String(phase.multiplier).replace('.', ','));
  const [phrase, setPhrase] = useState(phase.phrase);
  const [drivers, setDrivers] = useState(phase.drivers);
  const [channels, setChannels] = useState(phase.channels.join(', '));
  const [msg, setMsg] = useState('');
  const save = async () => {
    const r = await act('updatePhase', {
      phaseId: phase.id,
      title,
      multiplier: Number(mult.replace(',', '.')),
      phrase,
      drivers,
      channels: channels.split(',').map((c) => c.trim()),
    });
    setMsg(r.ok ? '✔ Guardado' : '');
    if (r.ok) onSaved();
  };
  return (
    <Card className="ring-2 ring-white/20">
      <div className="mb-3 flex items-center gap-3">
        <PhaseBadge phase={phase} />
        <span className="text-white/70">{phase.questionCount} preguntas</span>
      </div>
      <div className="grid gap-3 md:grid-cols-[2fr_1fr]">
        <label className={label}>
          Nombre del capítulo
          <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className={label}>
          Multiplicador
          <input className={input} value={mult} onChange={(e) => setMult(e.target.value)} inputMode="decimal" />
        </label>
        <label className={label}>
          Canales (separados por coma)
          <input className={input} value={channels} onChange={(e) => setChannels(e.target.value)} />
        </label>
        <label className={label}>
          Motivaciones
          <input className={input} value={drivers} onChange={(e) => setDrivers(e.target.value)} />
        </label>
        <label className={`${label} md:col-span-2`}>
          Frase del capítulo
          <input className={input} value={phrase} onChange={(e) => setPhrase(e.target.value)} />
        </label>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Button onClick={save}>Guardar fase</Button>
        <span className="text-turq">{msg}</span>
      </div>
    </Card>
  );
}

function QuestionEditor({ q, act, onSaved }: { q: Q; act: Act; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState(q.prompt);
  const [options, setOptions] = useState(q.options.join('\n'));
  const [answer, setAnswer] = useState(Array.isArray(q.answer) ? q.answer.join('\n') : String(q.answer));
  const [unit, setUnit] = useState(q.unit ?? '');
  const [min, setMin] = useState(q.min === null ? '' : String(q.min));
  const [max, setMax] = useState(q.max === null ? '' : String(q.max));
  const [step, setStep] = useState(q.step === null ? '' : String(q.step));
  const [reveal, setReveal] = useState(q.reveal);
  const [hostNote, setHostNote] = useState(q.hostNote);
  const [timeLimit, setTimeLimit] = useState(String(q.timeLimit));
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const meta = TYPE_META[q.type];
  const disabled = q.played;

  const save = async () => {
    setErr('');
    setMsg('');
    const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);
    const payload: Record<string, unknown> = {
      id: q.id,
      prompt,
      reveal,
      hostNote,
      timeLimit: timeLimit === '' ? null : Number(timeLimit),
    };
    if (q.type === 'intruso' || q.type === 'ranking') payload.options = lines(options);
    if (q.type === 'ranking') payload.answer = lines(answer);
    else if (q.type === 'numeric') {
      payload.answer = Number(answer.replace(',', '.'));
      Object.assign(payload, { unit, min, max, step });
    } else payload.answer = answer;
    const r = await act('updateQuestion', payload);
    if (!r.ok) return setErr(r.error ?? 'No se pudo guardar');
    setMsg('✔ Guardado');
    onSaved();
  };

  return (
    <Card className={disabled ? 'opacity-70' : ''}>
      <button className="flex w-full items-start gap-3 text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="text-2xl" aria-hidden>
          {meta.icon}
        </span>
        <span className="flex-1">
          <span className="block text-xs font-bold uppercase text-white/60">
            P{q.order + 1} · {meta.label} {q.played && '· jugada 🔒'}
          </span>
          <span className="font-semibold">{q.prompt}</span>
        </span>
        <span className="text-white/60">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <fieldset disabled={disabled} className="mt-4 grid gap-3 md:grid-cols-2">
          <label className={`${label} md:col-span-2`}>
            Enunciado
            <textarea className={input} rows={2} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
          </label>
          {(q.type === 'intruso' || q.type === 'ranking') && (
            <label className={label}>
              {q.type === 'ranking' ? 'Ítems (uno por línea, en el orden en que se muestran)' : 'Opciones (una por línea)'}
              <textarea className={input} rows={4} value={options} onChange={(e) => setOptions(e.target.value)} />
            </label>
          )}
          {q.type === 'mito_realidad' && (
            <label className={label}>
              Respuesta correcta
              <select className={input} value={answer} onChange={(e) => setAnswer(e.target.value)}>
                <option value="MITO">MITO</option>
                <option value="REALIDAD">REALIDAD</option>
              </select>
            </label>
          )}
          {q.type === 'intruso' && (
            <label className={label}>
              Respuesta correcta (debe coincidir con una opción)
              <select className={input} value={answer} onChange={(e) => setAnswer(e.target.value)}>
                {options
                  .split('\n')
                  .map((o) => o.trim())
                  .filter(Boolean)
                  .map((o) => (
                    <option key={o}>{o}</option>
                  ))}
              </select>
            </label>
          )}
          {q.type === 'ranking' && (
            <label className={label}>
              Orden correcto (uno por línea, de mayor a menor)
              <textarea className={input} rows={4} value={answer} onChange={(e) => setAnswer(e.target.value)} />
            </label>
          )}
          {q.type === 'numeric' && (
            <div className="grid grid-cols-2 gap-3 md:col-span-2 md:grid-cols-5">
              <label className={label}>
                Respuesta
                <input className={input} value={answer} onChange={(e) => setAnswer(e.target.value)} inputMode="decimal" />
              </label>
              <label className={label}>
                Unidad
                <input className={input} value={unit} onChange={(e) => setUnit(e.target.value)} />
              </label>
              <label className={label}>
                Mínimo
                <input className={input} value={min} onChange={(e) => setMin(e.target.value)} inputMode="decimal" />
              </label>
              <label className={label}>
                Máximo
                <input className={input} value={max} onChange={(e) => setMax(e.target.value)} inputMode="decimal" />
              </label>
              <label className={label}>
                Paso
                <input className={input} value={step} onChange={(e) => setStep(e.target.value)} inputMode="decimal" />
              </label>
            </div>
          )}
          <label className={`${label} md:col-span-2`}>
            Lo que dice la data (revelación)
            <textarea className={input} rows={3} value={reveal} onChange={(e) => setReveal(e.target.value)} />
          </label>
          <label className={`${label} md:col-span-2`}>
            Nota del presentador
            <textarea className={input} rows={2} value={hostNote} onChange={(e) => setHostNote(e.target.value)} />
          </label>
          <label className={label}>
            Tiempo (segundos)
            <input className={input} value={timeLimit} onChange={(e) => setTimeLimit(e.target.value)} inputMode="numeric" />
          </label>
          <div className="flex items-end gap-3">
            <Button onClick={save}>Guardar pregunta</Button>
            <span className="text-turq">{msg}</span>
          </div>
          <div className="md:col-span-2">
            <ErrorText>{err}</ErrorText>
          </div>
          <p className="text-xs text-white/60 md:col-span-2">Multiplicador efectivo: x{fmt(q.multiplier)}</p>
        </fieldset>
      )}
    </Card>
  );
}
