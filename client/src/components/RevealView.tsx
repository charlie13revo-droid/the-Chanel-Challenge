import type { PublicQuestion, RevealData } from '../../../shared/types.ts';
import { answerLabel, fmt, fmtUnit } from '../lib/format.ts';
import { useCountUp, useDelayed } from '../lib/hooks.ts';

/** Revelación animada para la vista Pantalla (escenario 1920×1080). */
export function RevealView({ q, r }: { q: PublicQuestion; r: RevealData }) {
  const grow = useDelayed(900, r.questionId);
  return (
    <div className="grid h-full grid-cols-[1.45fr_1fr] gap-10">
      <div className="flex min-h-0 flex-col gap-6">
        <p className="text-3xl font-semibold leading-snug text-white/85">{q.prompt}</p>
        <CorrectCard q={q} r={r} />
        <div className="min-h-0 flex-1">
          {r.type === 'numeric' ? <Histogram r={r} grow={grow} /> : <Bars r={r} grow={grow} />}
        </div>
      </div>
      <div className="flex flex-col gap-6">
        <div className="anim-flip rounded-[2rem] bg-white p-8 text-deepest shadow-2xl" style={{ animationDelay: '1.6s' }}>
          <div className="mb-3 flex items-center gap-3 text-2xl font-black uppercase tracking-wide text-pink">
            <span aria-hidden>📊</span> Lo que dice la data
          </div>
          <p className="text-[2.1rem] font-bold leading-snug">{r.reveal}</p>
          <p className="mt-5 text-base leading-snug text-deepest/70">Fuente: {r.source}</p>
        </div>
        <div className="anim-pop grid grid-cols-2 gap-4" style={{ animationDelay: '2.2s' }}>
          <Stat label="Acertó la sala" value={`${fmt(r.correctPct)}%`} />
          <Stat label="Respondieron" value={fmt(r.respondents)} />
        </div>
        {r.closest && (
          <div className="anim-pop rounded-3xl bg-sun p-5 text-deepest" style={{ animationDelay: '2.6s' }}>
            <div className="text-xl font-bold">🎯 Bono +100 al más cercano</div>
            <div className="text-3xl font-black">
              {r.closest.nickname} · {fmtUnit(r.closest.value, q.unit)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl bg-white/10 p-5 ring-1 ring-white/15">
      <div className="text-xl text-white/75">{label}</div>
      <div className="text-5xl font-black text-turq tabular-nums">{value}</div>
    </div>
  );
}

function CorrectCard({ q, r }: { q: PublicQuestion; r: RevealData }) {
  if (r.type === 'numeric') return <NumericCompare q={q} r={r} />;
  if (r.type === 'ranking') {
    const real = r.correctAnswer as string[];
    const room = r.roomOrder ?? [];
    return (
      <div className="anim-flip grid grid-cols-2 gap-6">
        <OrderList title="✔ Orden real" items={real} accent />
        <OrderList title="Orden promedio de la sala" items={room} compareTo={real} />
      </div>
    );
  }
  return (
    <div className="anim-flip flex items-center gap-6 rounded-[2rem] bg-turq px-8 py-6 text-deepest">
      <span className="text-6xl" aria-hidden>
        ✔
      </span>
      <div>
        <div className="text-2xl font-bold uppercase">Respuesta correcta</div>
        <div className="text-6xl font-black">{answerLabel(r.correctAnswer)}</div>
      </div>
    </div>
  );
}

function OrderList({ title, items, accent, compareTo }: { title: string; items: string[]; accent?: boolean; compareTo?: string[] }) {
  return (
    <div className={`rounded-[2rem] p-5 ${accent ? 'bg-turq text-deepest' : 'bg-white/10 ring-1 ring-white/20'}`}>
      <div className="mb-2 text-xl font-bold uppercase">{title}</div>
      <ol className="flex flex-col gap-1">
        {items.map((it, i) => {
          const ok = compareTo ? compareTo[i] === it : true;
          return (
            <li key={it} className="flex items-center gap-3 text-[1.7rem] font-bold">
              <span className="w-8 font-black">{i + 1}.</span>
              <span className="flex-1 truncate">{it}</span>
              {compareTo && <span aria-label={ok ? 'coincide' : 'no coincide'}>{ok ? '✔' : '✗'}</span>}
            </li>
          );
        })}
        {!items.length && <li className="text-xl">Sin respuestas</li>}
      </ol>
    </div>
  );
}

function NumericCompare({ q, r }: { q: PublicQuestion; r: RevealData }) {
  const real = Number(r.correctAnswer);
  const shown = useCountUp(real, 1600);
  const avg = useCountUp(r.roomAverage ?? 0, 1600);
  const decimals = (q.step ?? 1) < 1 ? 1 : 0;
  const round = (n: number) => Number(n.toFixed(decimals));
  return (
    <div className="grid grid-cols-2 gap-6">
      <div className="anim-flip rounded-[2rem] bg-turq px-8 py-5 text-deepest">
        <div className="text-2xl font-bold uppercase">✔ Dato real</div>
        <div className="text-7xl font-black tabular-nums">{fmtUnit(round(shown), q.unit)}</div>
      </div>
      <div className="anim-flip rounded-[2rem] bg-white/10 px-8 py-5 ring-1 ring-white/20" style={{ animationDelay: '0.3s' }}>
        <div className="text-2xl font-bold uppercase text-white/80">Promedio de la sala</div>
        <div className="text-7xl font-black tabular-nums text-sun">{r.respondents ? fmtUnit(round(avg), q.unit) : '—'}</div>
        {r.roomMedian !== undefined && <div className="text-xl text-white/70">Mediana: {fmtUnit(round(r.roomMedian), q.unit)}</div>}
      </div>
    </div>
  );
}

function Bars({ r, grow }: { r: RevealData; grow: boolean }) {
  const title = r.type === 'ranking' ? '% de la sala que ubicó bien cada ítem' : 'Lo que votó la sala';
  return (
    <div className="flex flex-col gap-3">
      <div className="text-2xl font-bold text-white/80">{title}</div>
      {r.bars.map((b, i) => (
        <div key={b.label} className="flex items-center gap-4">
          <div className="w-[26rem] truncate text-right text-[1.6rem] font-bold">
            {r.type !== 'ranking' && (b.correct ? '✔ ' : '✗ ')}
            {b.label === 'MITO' ? 'Mito' : b.label === 'REALIDAD' ? 'Realidad' : b.label}
          </div>
          <div className="h-14 flex-1 overflow-hidden rounded-2xl bg-white/10">
            <div
              className={`h-full rounded-2xl ${
                b.correct && r.type !== 'ranking' ? 'bg-turq text-deepest' : r.type === 'ranking' ? 'bg-sun text-deepest' : 'bg-pink text-white'
              }`}
              style={{ width: grow ? `${Math.max(b.pct, 1.5)}%` : '0%', transition: `width 1.2s cubic-bezier(0.2,0.8,0.2,1) ${i * 0.12}s` }}
            />
          </div>
          <div className="w-28 text-right text-[1.7rem] font-black tabular-nums">{grow ? `${fmt(b.pct)}%` : ''}</div>
        </div>
      ))}
    </div>
  );
}

function Histogram({ r, grow }: { r: RevealData; grow: boolean }) {
  const maxPct = Math.max(1, ...r.bars.map((b) => b.pct));
  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 text-2xl font-bold text-white/80">Distribución de respuestas de la sala</div>
      <div className="flex min-h-[260px] flex-1 items-end gap-2">
        {r.bars.map((b, i) => (
          <div key={b.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <div className="text-lg font-bold tabular-nums">{grow ? `${fmt(b.pct)}%` : ''}</div>
            <div
              className={`w-full rounded-t-xl ${b.correct ? 'bg-turq' : 'bg-white/30'}`}
              style={{ height: grow ? `${(b.pct / maxPct) * 85}%` : '0%', minHeight: 4, transition: `height 1.1s cubic-bezier(0.2,0.8,0.2,1) ${i * 0.06}s` }}
            />
            <div className={`text-center text-sm leading-tight ${b.correct ? 'font-black text-turq' : 'text-white/70'}`}>
              {b.correct && '✔ '}
              {b.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
