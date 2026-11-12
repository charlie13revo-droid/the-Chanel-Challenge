import { useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { QuestionType } from '../../../shared/types.ts';
import { fmt, fmtUnit } from '../lib/format.ts';

// ---------- Ranking: drag & drop + botones ↑↓ ----------
export function RankingInput({ items, onChange }: { items: string[]; onChange: (v: string[]) => void }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length) return;
    onChange(arrayMove(items, from, to));
  };
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    move(items.indexOf(String(e.active.id)), items.indexOf(String(e.over.id)));
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        <ol className="flex flex-col gap-3">
          {items.map((it, i) => (
            <SortableRow key={it} id={it} index={i} total={items.length} onUp={() => move(i, i - 1)} onDown={() => move(i, i + 1)} />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({ id, index, total, onUp, onDown }: { id: string; index: number; total: number; onUp: () => void; onDown: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-2 rounded-2xl bg-white/10 p-2 ring-1 ring-white/20 ${isDragging ? 'z-10 bg-turq/30 shadow-2xl ring-turq' : ''}`}
    >
      <span className="w-9 text-center text-2xl font-black text-sun">{index + 1}</span>
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="flex min-h-12 flex-1 cursor-grab touch-none items-center gap-3 rounded-xl px-2 text-left text-lg font-bold"
        aria-label={`${id}, posición ${index + 1}. Arrastra para mover`}
      >
        <span aria-hidden className="text-white/50">⠿</span>
        {id}
      </button>
      <button type="button" onClick={onUp} disabled={index === 0} className="h-12 w-12 rounded-xl bg-white/10 text-xl font-black disabled:opacity-25" aria-label={`Subir ${id}`}>
        ↑
      </button>
      <button type="button" onClick={onDown} disabled={index === total - 1} className="h-12 w-12 rounded-xl bg-white/10 text-xl font-black disabled:opacity-25" aria-label={`Bajar ${id}`}>
        ↓
      </button>
    </li>
  );
}

// ---------- Numérico: slider + campo con unidades ----------
export function NumericInput({
  value,
  onChange,
  min,
  max,
  step,
  unit,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  unit: string | null;
}) {
  const [text, setText] = useState(String(value).replace('.', ','));
  const decimals = step < 1 ? 1 : 0;
  // El slider usa pasos más gruesos en rangos grandes (COP); el campo admite el valor exacto.
  const sliderStep = max - min > 5000 ? Math.max(step, 100) : max - min > 500 ? Math.max(step, 10) : step;
  const set = (n: number) => {
    const c = Math.min(max, Math.max(min, n));
    const r = Number(c.toFixed(decimals));
    onChange(r);
    setText(String(r).replace('.', ','));
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="text-center text-5xl font-black text-turq tabular-nums" aria-live="polite">
        {fmtUnit(value, unit)}
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={sliderStep}
        value={value}
        onChange={(e) => set(Number(e.target.value))}
        aria-label="Desliza para elegir tu respuesta"
        className="w-full"
      />
      <div className="flex justify-between text-sm text-white/70">
        <span>{fmtUnit(min, unit)}</span>
        <span>{fmtUnit(max, unit)}</span>
      </div>
      <label className="flex items-center gap-3">
        <span className="text-white/80">Valor exacto:</span>
        {unit === 'COP' && <span className="text-xl font-bold">$</span>}
        <input
          inputMode="decimal"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const n = Number(e.target.value.replace(/\./g, '').replace(',', '.'));
            if (unit !== 'COP') {
              const m = Number(e.target.value.replace(',', '.'));
              if (Number.isFinite(m) && e.target.value.trim() !== '') onChange(Math.min(max, Math.max(min, m)));
            } else if (Number.isFinite(n) && e.target.value.trim() !== '') onChange(Math.min(max, Math.max(min, n)));
          }}
          onBlur={() => set(value)}
          className="min-h-12 w-36 flex-1 rounded-xl bg-white px-3 text-xl font-bold text-deepest"
          aria-label={`Valor exacto${unit ? ` en ${unit}` : ''}`}
        />
        {unit && unit !== 'COP' && <span className="text-xl font-bold">{unit}</span>}
      </label>
    </div>
  );
}

// ---------- Apuesta: slider + 10% / 25% / 50% / ALL-IN ----------
export function BetPicker({
  balance,
  min,
  bet,
  onChange,
  multiplier,
  type,
}: {
  balance: number;
  min: number;
  bet: number;
  onChange: (n: number) => void;
  multiplier: number;
  type: QuestionType;
}) {
  const quick: [string, number][] = [
    ['10%', min],
    ['25%', Math.max(min, Math.round(balance * 0.25))],
    ['50%', Math.max(min, Math.round(balance * 0.5))],
    ['ALL-IN', balance],
  ];
  const best = type === 'numeric' ? 2 : type === 'ranking' ? 1.5 : 1;
  const maxWin = Math.round(bet * multiplier * best);
  return (
    <div className="flex flex-col gap-4">
      <div className="text-center">
        <div className="text-sm uppercase tracking-wider text-white/70">Tu apuesta</div>
        <div className="text-6xl font-black text-sun tabular-nums" aria-live="polite">
          {fmt(bet)}
        </div>
        <div className="text-white/70">de {fmt(balance)} puntos</div>
      </div>
      <input
        type="range"
        min={min}
        max={balance}
        step={1}
        value={bet}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="Desliza para elegir tu apuesta"
        className="w-full"
      />
      <div className="grid grid-cols-4 gap-2">
        {quick.map(([label, v]) => (
          <button
            key={label}
            type="button"
            onClick={() => onChange(v)}
            aria-pressed={bet === v}
            className={`min-h-12 rounded-xl text-base font-black ring-1 transition ${
              bet === v ? 'bg-sun text-deepest ring-sun' : label === 'ALL-IN' ? 'bg-pink/25 ring-pink' : 'bg-white/10 ring-white/20'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 text-center text-sm">
        <div className="rounded-xl bg-turq/15 p-2 ring-1 ring-turq/50">
          Si aciertas{type === 'numeric' ? ' (≤5%)' : ''}
          <div className="text-xl font-black text-turq">+{fmt(maxWin)}</div>
        </div>
        <div className="rounded-xl bg-pink/15 p-2 ring-1 ring-pink/50">
          Si fallas
          <div className="text-xl font-black text-white">−{fmt(bet)}</div>
        </div>
      </div>
      <p className="text-center text-xs text-white/60">Mínimo 10% del saldo ({fmt(min)}) · multiplicador x{fmt(multiplier)}</p>
    </div>
  );
}
