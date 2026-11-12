import { useEffect, useState } from 'react';
import type { LeaderEntry } from '../../../shared/types.ts';
import { fmt } from '../lib/format.ts';

/**
 * Top 10 animado: las filas arrancan en su posición anterior y se deslizan a la nueva,
 * con flechas de subida/bajada.
 */
export function Leaderboard({ entries, rowHeight = 76, compact = false }: { entries: LeaderEntry[]; rowHeight?: number; compact?: boolean }) {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    setSettled(false);
    const id = setTimeout(() => setSettled(true), 700);
    return () => clearTimeout(id);
  }, [entries]);

  const n = entries.length;
  const pos = (e: LeaderEntry) => {
    if (settled || e.prevRank === null) return e.rank - 1;
    return Math.min(n, e.prevRank - 1); // los que venían de fuera del top entran desde abajo
  };

  return (
    <div className="relative w-full" style={{ height: n * rowHeight }}>
      {entries.map((e) => {
        const diff = e.prevRank === null ? 0 : e.prevRank - e.rank;
        const top3 = e.rank <= 3;
        return (
          <div
            key={e.playerId}
            className="absolute inset-x-0 flex items-center gap-4 px-2"
            style={{
              height: rowHeight - 8,
              transform: `translateY(${pos(e) * rowHeight}px)`,
              opacity: settled || e.prevRank === null || e.prevRank <= n ? 1 : 0.2,
              transition: 'transform 1.1s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.8s',
            }}
          >
            <div
              className={`flex h-full w-full items-center gap-4 rounded-2xl px-5 ring-1 ${
                top3 ? 'bg-sun/15 ring-sun/50' : 'bg-white/5 ring-white/10'
              }`}
            >
              <span className={`w-12 text-center font-black tabular-nums ${compact ? 'text-xl' : 'text-3xl'} ${top3 ? 'text-sun' : ''}`}>
                {e.rank}
              </span>
              <span className={`flex-1 truncate font-bold ${compact ? 'text-lg' : 'text-3xl'}`}>
                {e.nickname}
                {e.team && <span className={`ml-3 font-medium text-white/60 ${compact ? 'text-sm' : 'text-xl'}`}>{e.team}</span>}
              </span>
              <Movement diff={diff} isNew={e.prevRank === null} compact={compact} />
              <span className={`w-36 text-right font-black tabular-nums text-turq ${compact ? 'text-xl' : 'text-3xl'}`}>{fmt(e.balance)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Movement({ diff, isNew, compact }: { diff: number; isNew: boolean; compact: boolean }) {
  const cls = `w-20 text-right font-bold ${compact ? 'text-base' : 'text-2xl'}`;
  if (isNew) return <span className={`${cls} text-white/50`}>—</span>;
  if (diff > 0)
    return (
      <span className={`${cls} text-turq`} aria-label={`subió ${diff} puestos`}>
        ▲ {diff}
      </span>
    );
  if (diff < 0)
    return (
      <span className={`${cls} text-pink`} aria-label={`bajó ${-diff} puestos`}>
        ▼ {-diff}
      </span>
    );
  return (
    <span className={`${cls} text-white/50`} aria-label="se mantiene">
      ＝
    </span>
  );
}
