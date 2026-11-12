import { ButtonHTMLAttributes, ReactNode, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import type { PhaseMeta, QuestionType } from '../../../shared/types.ts';
import { fmtMultiplier, PHASE_COLORS, TYPE_META } from '../lib/format.ts';

type Variant = 'primary' | 'pink' | 'ghost' | 'sun' | 'danger';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-turq text-deepest hover:brightness-110',
  pink: 'bg-pink text-white hover:brightness-110',
  sun: 'bg-sun text-deepest hover:brightness-105',
  ghost: 'bg-white/10 text-white hover:bg-white/20 ring-1 ring-white/20',
  danger: 'bg-transparent text-pink ring-2 ring-pink hover:bg-pink hover:text-white',
};

export function Button({
  variant = 'primary',
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...rest}
      className={`min-h-12 rounded-2xl px-5 py-3 text-lg font-bold transition active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-35 disabled:active:scale-100 ${VARIANTS[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return <div className={`rounded-3xl bg-deeper/80 p-5 ring-1 ring-white/10 backdrop-blur ${className}`}>{children}</div>;
}

export function Logo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const cls = { sm: 'text-lg', md: 'text-2xl', lg: 'text-4xl', xl: 'text-7xl' }[size];
  return (
    <div className={`font-black leading-none tracking-tight ${cls}`}>
      <span className="text-turq">The Channel</span> <span className="text-sun">Challenge</span>
    </div>
  );
}

export function PhaseBadge({ phase, large = false }: { phase: PhaseMeta; large?: boolean }) {
  const c = PHASE_COLORS[phase.color] ?? PHASE_COLORS.green;
  const label = phase.id === 5 ? '★ Pregunta de Oro' : `Fase ${phase.id}`;
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full font-bold ${large ? 'px-6 py-2 text-3xl' : 'px-3 py-1 text-sm'}`}
      style={{ background: c.hex, color: c.text }}
    >
      {label} · {fmtMultiplier(phase.multiplier)}
    </span>
  );
}

export function TypeBadge({ type, large = false }: { type: QuestionType; large?: boolean }) {
  const t = TYPE_META[type];
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full bg-white/10 font-semibold ring-1 ring-white/20 ${large ? 'px-6 py-2 text-3xl' : 'px-3 py-1 text-sm'}`}
    >
      <span aria-hidden>{t.icon}</span> {t.label}
    </span>
  );
}

export function Qr({ url, size = 240 }: { url: string; size?: number }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    QRCode.toDataURL(url, { margin: 1, width: size * 2, color: { dark: '#042830', light: '#FFFFFF' } }).then(setSrc);
  }, [url, size]);
  return src ? (
    <img src={src} width={size} height={size} alt={`Código QR para entrar: ${url}`} className="rounded-2xl bg-white p-2" />
  ) : (
    <div style={{ width: size, height: size }} className="rounded-2xl bg-white/10" />
  );
}

/** Anillo de cuenta regresiva. */
export function CountdownRing({ left, total, size = 120 }: { left: number; total: number; size?: number }) {
  const r = size / 2 - 8;
  const circ = 2 * Math.PI * r;
  const frac = total > 0 ? Math.max(0, Math.min(1, left / total)) : 0;
  const urgent = left <= 5;
  return (
    <div className="relative" style={{ width: size, height: size }} role="timer" aria-label={`${Math.ceil(left)} segundos`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.15)" strokeWidth="10" fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={urgent ? '#E5195E' : '#2EE6C8'}
          strokeWidth="10"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - frac)}
          style={{ transition: 'stroke-dashoffset 0.2s linear, stroke 0.3s' }}
        />
      </svg>
      <div
        className={`absolute inset-0 flex items-center justify-center font-black tabular-nums ${urgent ? 'text-pink' : ''}`}
        style={{ fontSize: size * 0.36 }}
      >
        {Math.ceil(left)}
      </div>
    </div>
  );
}

export function ProgressBar({ value, max, label }: { value: number; max: number; label?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="w-full">
      {label && <div className="mb-1 text-sm text-white/80">{label}</div>}
      <div className="h-4 w-full overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={value} aria-valuemax={max}>
        <div className="h-full rounded-full bg-turq transition-all duration-700" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function ErrorText({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-xl bg-pink/20 px-4 py-2 font-medium text-white ring-1 ring-pink">
      ⚠️ {children}
    </p>
  );
}

export function ConnectionDot({ connected }: { connected: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-white/80">
      <span className={`h-2.5 w-2.5 rounded-full ${connected ? 'bg-turq' : 'animate-pulse bg-pink'}`} />
      {connected ? 'En línea' : 'Reconectando…'}
    </span>
  );
}
