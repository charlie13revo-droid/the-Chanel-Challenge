import { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { fmt, fmtSigned } from '../lib/format.ts';

interface Item {
  nickname: string;
  team: string | null;
  value: number;
}

const ORDER = [1, 0, 2]; // 2°, 1°, 3°
const HEIGHTS = [320, 230, 170];
const MEDALS = ['🥇', '🥈', '🥉'];

export function Podium({ items, signed = false, withConfetti = false }: { items: Item[]; signed?: boolean; withConfetti?: boolean }) {
  useEffect(() => {
    if (!withConfetti) return;
    const colors = ['#2EE6C8', '#E5195E', '#FFD23F', '#ffffff'];
    const end = Date.now() + 3500;
    let raf = 0;
    const frame = () => {
      confetti({ particleCount: 6, angle: 60, spread: 70, origin: { x: 0, y: 0.7 }, colors });
      confetti({ particleCount: 6, angle: 120, spread: 70, origin: { x: 1, y: 0.7 }, colors });
      if (Date.now() < end) raf = requestAnimationFrame(frame);
    };
    const t = setTimeout(() => {
      confetti({ particleCount: 180, spread: 110, origin: { y: 0.45 }, colors });
      frame();
    }, 900);
    return () => {
      clearTimeout(t);
      cancelAnimationFrame(raf);
    };
  }, [withConfetti]);

  return (
    <div className="flex items-end justify-center gap-6">
      {ORDER.map((idx, slot) => {
        const it = items[idx];
        if (!it) return <div key={slot} className="w-72" />;
        return (
          <div key={slot} className="anim-pop flex w-72 flex-col items-center" style={{ animationDelay: `${(2 - idx) * 0.45}s` }}>
            <div className="mb-2 text-6xl" aria-hidden>
              {MEDALS[idx]}
            </div>
            <div className="mb-1 max-w-full truncate text-center text-3xl font-black">{it.nickname}</div>
            {it.team && <div className="mb-1 text-lg text-white/70">{it.team}</div>}
            <div className={`mb-3 text-3xl font-black tabular-nums ${signed && it.value < 0 ? 'text-white' : 'text-turq'}`}>{signed ? fmtSigned(it.value) : fmt(it.value)}</div>
            <div
              className={`flex w-full items-start justify-center rounded-t-3xl pt-4 text-6xl font-black ${
                idx === 0 ? 'bg-sun text-deepest' : 'bg-white/15'
              }`}
              style={{ height: HEIGHTS[idx] }}
            >
              {idx + 1}
            </div>
          </div>
        );
      })}
    </div>
  );
}
