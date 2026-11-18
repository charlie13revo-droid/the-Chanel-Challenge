// Infografía "Cómo se juega": diapositiva general + una por tipo de pregunta.
// Se muestra grande en la Pantalla (16:9) y compacta en el celular, sincronizada por el host.
import type { ReactNode } from 'react';
import type { PhaseMeta, QuestionType } from '../../../shared/types.ts';
import { fmt, fmtMultiplier, PHASE_COLORS, TYPE_META } from '../lib/format.ts';

type Variant = 'screen' | 'phone';

export const HOWTO_TYPES: QuestionType[] = ['mito_realidad', 'intruso', 'ranking', 'numeric'];

interface ScoreRow {
  mark: string;
  tone: 'win' | 'even' | 'lose' | 'bonus';
  when: string;
  result: string;
}

const TYPE_SLIDES: Record<QuestionType, { title: string; steps: string[]; scoring: ScoreRow[] }> = {
  mito_realidad: {
    title: 'Mito o Realidad',
    steps: ['Lee la afirmación.', 'Toca MITO o REALIDAD.', 'Elige cuánto apuestas y confirma.'],
    scoring: [
      { mark: '✔', tone: 'win', when: 'Aciertas', result: 'Ganas apuesta × multiplicador' },
      { mark: '✗', tone: 'lose', when: 'Fallas', result: 'Pierdes lo que apostaste' },
    ],
  },
  intruso: {
    title: 'El Intruso / Opción múltiple',
    steps: ['Lee bien: a veces se pide la que NO encaja (el intruso).', 'Toca una de las 4 opciones.', 'Elige cuánto apuestas y confirma.'],
    scoring: [
      { mark: '✔', tone: 'win', when: 'Aciertas', result: 'Ganas apuesta × multiplicador' },
      { mark: '✗', tone: 'lose', when: 'Fallas', result: 'Pierdes lo que apostaste' },
    ],
  },
  ranking: {
    title: 'Ranking',
    steps: ['Arrastra los ítems o usa las flechas ↑ ↓.', 'Arriba va el MAYOR, abajo el MENOR.', 'Toca “Listo”, apuesta y confirma.'],
    scoring: [
      { mark: '✔', tone: 'win', when: 'Todo en orden', result: 'Ganas 1,5 × apuesta × multiplicador' },
      { mark: '≈', tone: 'even', when: 'Al menos la mitad bien', result: 'Recuperas tu apuesta (0)' },
      { mark: '✗', tone: 'lose', when: 'Menos de la mitad', result: 'Pierdes lo que apostaste' },
    ],
  },
  numeric: {
    title: 'El Dato Correcto',
    steps: ['Mueve la barra o escribe el número exacto.', 'Mientras más cerca del dato real, más ganas.', 'Toca “Listo”, apuesta y confirma.'],
    scoring: [
      { mark: '✔✔', tone: 'win', when: 'Error de 5% o menos', result: 'Ganas el doble: 2 × apuesta × mult.' },
      { mark: '✔', tone: 'win', when: 'Error de 15% o menos', result: 'Ganas apuesta × multiplicador' },
      { mark: '≈', tone: 'even', when: 'Error de 30% o menos', result: 'Recuperas tu apuesta (0)' },
      { mark: '✗', tone: 'lose', when: 'Más de 30% de error', result: 'Pierdes lo que apostaste' },
      { mark: '🎯', tone: 'bonus', when: 'El más cercano de la sala', result: 'Bono +100 puntos' },
    ],
  },
};

export function HowToSlide({ slide, phases, variant }: { slide: number; phases: PhaseMeta[]; variant: Variant }) {
  if (slide <= 0) return <GeneralSlide phases={phases} variant={variant} />;
  const type = HOWTO_TYPES[Math.min(slide, 4) - 1];
  return <TypeSlide type={type} variant={variant} />;
}

/** Puntos de progreso de las diapositivas. */
export function SlideDots({ slide, total, large }: { slide: number; total: number; large?: boolean }) {
  return (
    <div className="flex items-center justify-center gap-2" aria-label={`Diapositiva ${slide + 1} de ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`rounded-full transition-all ${large ? 'h-4' : 'h-2.5'} ${i === slide ? `bg-sun ${large ? 'w-14' : 'w-8'}` : `bg-white/25 ${large ? 'w-4' : 'w-2.5'}`}`}
        />
      ))}
    </div>
  );
}

// ---------- Diapositiva general ----------
function GeneralSlide({ phases, variant }: { phases: PhaseMeta[]; variant: Variant }) {
  const big = variant === 'screen';
  const steps = [
    { n: 1, icon: '👆', title: 'Responde', text: 'Elige tu respuesta en el celular.' },
    { n: 2, icon: '🎲', title: 'Apuesta', text: 'Mínimo 10% de tu saldo. Si estás seguro: ALL-IN.' },
    { n: 3, icon: '✅', title: 'Confirma', text: 'Toca “Confirmar apuesta” antes de que acabe el tiempo.' },
  ];
  return (
    <div className={`flex h-full flex-col ${big ? 'gap-7' : 'gap-4'}`}>
      <div className="text-center">
        <div className={`font-bold uppercase tracking-[0.25em] text-turq ${big ? 'text-3xl' : 'text-xs'}`}>Cómo se juega</div>
        <h2 className={`font-black leading-tight ${big ? 'mt-1 text-7xl' : 'mt-1 text-3xl'}`}>3 pasos en cada pregunta</h2>
      </div>
      <div className={`grid ${big ? 'grid-cols-3 gap-8' : 'grid-cols-1 gap-3'}`}>
        {steps.map((s) => (
          <div key={s.n} className={`relative flex rounded-[2rem] bg-white/10 ring-1 ring-white/15 ${big ? 'flex-col items-center gap-2 px-6 py-5 text-center' : 'items-center gap-3 p-3'}`}>
            <span className={`flex shrink-0 items-center justify-center rounded-full bg-sun font-black text-deepest ${big ? 'h-14 w-14 text-4xl' : 'h-10 w-10 text-xl'}`}>{s.n}</span>
            <span className={big ? 'text-6xl' : 'text-3xl'} aria-hidden>
              {s.icon}
            </span>
            <span className={big ? '' : 'flex-1'}>
              <span className={`block font-black ${big ? 'text-5xl' : 'text-lg'}`}>{s.title}</span>
              <span className={`block text-white/85 ${big ? 'mt-1 text-[1.7rem] leading-snug' : 'text-sm leading-snug'}`}>{s.text}</span>
            </span>
          </div>
        ))}
      </div>
      <div className={`grid ${big ? 'grid-cols-[1.3fr_1fr] gap-8' : 'grid-cols-1 gap-3'}`}>
        <div className={`rounded-[2rem] bg-deeper/80 ring-1 ring-white/10 ${big ? 'p-6' : 'p-4'}`}>
          <div className={`font-bold ${big ? 'mb-3 text-[1.7rem]' : 'mb-2 text-base'}`}>
            Arrancas con <span className="text-sun">1.000 puntos</span>. Cada fase multiplica lo que ganas:
          </div>
          <div className={`flex flex-wrap ${big ? 'gap-3' : 'gap-1.5'}`}>
            {phases.map((p) => {
              const c = PHASE_COLORS[p.color] ?? PHASE_COLORS.green;
              return (
                <span key={p.id} className={`rounded-full font-bold ${big ? 'px-5 py-2 text-2xl' : 'px-2.5 py-1 text-xs'}`} style={{ background: c.hex, color: c.text }}>
                  {p.label} {fmtMultiplier(p.multiplier)}
                </span>
              );
            })}
          </div>
          <div className={`text-white/80 ${big ? 'mt-5 text-2xl' : 'mt-3 text-sm'}`}>
            Ejemplo: apuestas <b className="text-white">200</b> en una fase x1,25 y aciertas → <b className="text-turq">+250</b>.
          </div>
        </div>
        <div className={`flex flex-col rounded-[2rem] bg-deeper/80 ring-1 ring-white/10 ${big ? 'justify-center gap-4 p-6 text-2xl' : 'gap-2 p-4 text-sm'}`}>
          <Rule icon="⏱">Si no respondes a tiempo, pierdes el 10% de tu saldo.</Rule>
          <Rule icon="🛟">Si quedas con menos de 100, al empezar la siguiente fase vuelves a 300.</Rule>
          <Rule icon="⚡">Empate: gana quien respondió más rápido.</Rule>
        </div>
      </div>
    </div>
  );
}

function Rule({ icon, children }: { icon: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span aria-hidden>{icon}</span>
      <span className="text-white/90">{children}</span>
    </div>
  );
}

// ---------- Diapositiva por tipo ----------
function TypeSlide({ type, variant }: { type: QuestionType; variant: Variant }) {
  const big = variant === 'screen';
  const s = TYPE_SLIDES[type];
  const meta = TYPE_META[type];
  return (
    <div className={`flex h-full flex-col ${big ? 'gap-8' : 'gap-4'}`}>
      <div className={`flex items-center ${big ? 'gap-6' : 'gap-3'}`}>
        <span className={`flex shrink-0 items-center justify-center rounded-3xl bg-white/10 ring-1 ring-white/20 ${big ? 'h-32 w-32 text-8xl' : 'h-14 w-14 text-4xl'}`} aria-hidden>
          {meta.icon}
        </span>
        <div>
          <div className={`font-bold uppercase tracking-[0.25em] text-turq ${big ? 'text-2xl' : 'text-xs'}`}>Tipo de pregunta</div>
          <h2 className={`font-black leading-tight ${big ? 'text-7xl' : 'text-2xl'}`}>{s.title}</h2>
        </div>
      </div>
      <div className={`grid flex-1 ${big ? 'grid-cols-[440px_1fr] gap-12' : 'grid-cols-1 gap-4'}`}>
        <div className={big ? 'flex items-start justify-center' : 'flex justify-center'}>
          <PhoneMock type={type} big={big} />
        </div>
        <div className={`flex flex-col ${big ? 'gap-8' : 'gap-4'}`}>
          <div>
            <div className={`font-black text-sun ${big ? 'mb-4 text-4xl' : 'mb-2 text-lg'}`}>Cómo responder</div>
            <ol className={`flex flex-col ${big ? 'gap-4' : 'gap-2'}`}>
              {s.steps.map((st, i) => (
                <li key={st} className={`flex items-start ${big ? 'gap-4 text-[2.1rem] leading-snug' : 'gap-2 text-base leading-snug'}`}>
                  <span className={`flex shrink-0 items-center justify-center rounded-full bg-white/15 font-black ${big ? 'h-12 w-12 text-2xl' : 'h-7 w-7 text-sm'}`}>{i + 1}</span>
                  <span>{st}</span>
                </li>
              ))}
            </ol>
          </div>
          <div>
            <div className={`font-black text-sun ${big ? 'mb-4 text-4xl' : 'mb-2 text-lg'}`}>Cómo se puntúa</div>
            <div className={`flex flex-col ${big ? 'gap-3' : 'gap-1.5'}`}>
              {s.scoring.map((r) => (
                <div
                  key={r.when}
                  className={`flex items-center rounded-2xl ring-1 ${big ? 'gap-5 px-5 py-3 text-[1.7rem]' : 'gap-2 px-3 py-2 text-sm'} ${
                    r.tone === 'win' ? 'bg-turq/15 ring-turq/50' : r.tone === 'lose' ? 'bg-pink/15 ring-pink/50' : r.tone === 'bonus' ? 'bg-sun/15 ring-sun/60' : 'bg-white/10 ring-white/20'
                  }`}
                >
                  <span className={`shrink-0 text-center font-black ${big ? 'w-14' : 'w-7'} ${r.tone === 'win' ? 'text-turq' : r.tone === 'lose' ? 'text-pink' : r.tone === 'bonus' ? 'text-sun' : 'text-white'}`}>
                    {r.mark}
                  </span>
                  {big ? (
                    <>
                      <span className="flex-1 font-semibold">{r.when}</span>
                      <span className="text-right font-bold">{r.result}</span>
                    </>
                  ) : (
                    <span className="flex-1 leading-tight">
                      <span className="block font-semibold">{r.when}</span>
                      <span className="block font-bold text-white/90">{r.result}</span>
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Celular de ejemplo (ilustración, no interactivo) ----------
function PhoneMock({ type, big }: { type: QuestionType; big: boolean }) {
  const w = big ? 400 : 230;
  const s = w / 400; // escala de la ilustración
  const px = (n: number) => `${n * s}px`;
  const tap = (
    <span className="pointer-events-none absolute text-5xl drop-shadow-lg" style={{ fontSize: px(64), right: px(18), bottom: px(-18) }} aria-hidden>
      👆
    </span>
  );
  let body: ReactNode = null;
  if (type === 'mito_realidad')
    body = (
      <div className="grid grid-cols-2" style={{ gap: px(14) }}>
        <div className="flex flex-col items-center justify-center rounded-3xl bg-pink font-black text-white" style={{ height: px(170), fontSize: px(30) }}>
          <span style={{ fontSize: px(44) }}>✗</span>MITO
        </div>
        <div className="relative flex flex-col items-center justify-center rounded-3xl bg-turq font-black text-deepest ring-4 ring-sun" style={{ height: px(170), fontSize: px(26) }}>
          <span style={{ fontSize: px(44) }}>✓</span>REALIDAD
          {tap}
        </div>
      </div>
    );
  else if (type === 'intruso')
    body = (
      <div className="flex flex-col" style={{ gap: px(10) }}>
        {['Opción A', 'Opción B', 'Opción C', 'Opción D'].map((o, i) => (
          <div
            key={o}
            className={`relative flex items-center rounded-2xl font-bold ${i === 2 ? 'bg-turq/30 ring-4 ring-sun' : 'bg-white/10 ring-1 ring-white/25'}`}
            style={{ gap: px(12), padding: `${px(12)} ${px(14)}`, fontSize: px(24) }}
          >
            <span className="flex items-center justify-center rounded-full bg-sun font-black text-deepest" style={{ width: px(38), height: px(38), fontSize: px(20) }}>
              {String.fromCharCode(65 + i)}
            </span>
            {o}
            {i === 2 && tap}
          </div>
        ))}
      </div>
    );
  else if (type === 'ranking')
    body = (
      <div className="flex flex-col" style={{ gap: px(10) }}>
        {['Mayor', '', '', 'Menor'].map((label, i) => (
          <div
            key={i}
            className={`flex items-center rounded-2xl bg-white/10 ring-1 ring-white/25 ${i === 1 ? 'translate-x-2 bg-turq/30 shadow-2xl ring-turq' : ''}`}
            style={{ gap: px(10), padding: px(10), fontSize: px(22) }}
          >
            <span className="font-black text-sun" style={{ width: px(26) }}>
              {i + 1}
            </span>
            <span className="text-white/50">⠿</span>
            <span className="flex-1 font-bold">
              Ítem {String.fromCharCode(65 + i)}
              {label && <span className="ml-2 font-semibold text-white/60" style={{ fontSize: px(17) }}>({label})</span>}
            </span>
            <span className="rounded-lg bg-white/15 text-center font-black" style={{ width: px(36), lineHeight: px(36) }}>↑</span>
            <span className="rounded-lg bg-white/15 text-center font-black" style={{ width: px(36), lineHeight: px(36) }}>↓</span>
          </div>
        ))}
        <div className="relative rounded-2xl bg-turq text-center font-black text-deepest" style={{ padding: px(12), fontSize: px(22) }}>
          Listo →{tap}
        </div>
      </div>
    );
  else
    body = (
      <div className="flex flex-col items-stretch" style={{ gap: px(14) }}>
        <div className="text-center font-black text-turq" style={{ fontSize: px(64) }}>
          32%
        </div>
        <div className="relative rounded-full bg-white/15" style={{ height: px(14) }}>
          <div className="absolute inset-y-0 left-0 rounded-full bg-turq" style={{ width: '55%' }} />
          <div className="absolute top-1/2 -translate-y-1/2 rounded-full bg-white shadow-lg ring-4 ring-sun" style={{ left: `calc(55% - ${px(16)})`, width: px(32), height: px(32) }} />
        </div>
        <div className="flex justify-between text-white/70" style={{ fontSize: px(17) }}>
          <span>0%</span>
          <span>60%</span>
        </div>
        <div className="flex items-center" style={{ gap: px(10), fontSize: px(19) }}>
          <span className="text-white/80">Valor exacto:</span>
          <span className="flex-1 rounded-xl bg-white font-bold text-deepest" style={{ padding: `${px(8)} ${px(12)}` }}>
            32
          </span>
        </div>
        <div className="relative rounded-2xl bg-turq text-center font-black text-deepest" style={{ padding: px(12), fontSize: px(22) }}>
          Listo →{tap}
        </div>
      </div>
    );

  return (
    <div
      className="relative shrink-0 rounded-[2.6rem] bg-deepest ring-8 ring-white/20 shadow-2xl"
      style={{ width: w, padding: `${px(54)} ${px(22)} ${px(34)}` }}
      aria-hidden
    >
      <div className="absolute left-1/2 -translate-x-1/2 rounded-full bg-white/20" style={{ top: px(18), width: px(110), height: px(14) }} />
      <div className="mb-3 flex items-center justify-between" style={{ marginBottom: px(16) }}>
        <span className="rounded-full bg-white/10 font-semibold" style={{ padding: `${px(4)} ${px(12)}`, fontSize: px(17) }}>
          {TYPE_META[type].icon} {TYPE_META[type].label}
        </span>
        <span className="rounded-full font-black text-turq ring-4 ring-turq" style={{ width: px(46), lineHeight: px(38), fontSize: px(18), textAlign: 'center' }}>
          25
        </span>
      </div>
      {body}
    </div>
  );
}
