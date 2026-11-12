import { FormEvent, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { MAX_NICK } from '../../../shared/types.ts';
import { Button, ErrorText, Logo } from '../components/ui.tsx';
import { call } from '../lib/socket.ts';
import { getSession, saveSession } from '../lib/session.ts';

export function Home() {
  const params = useParams();
  const nav = useNavigate();
  const existing = getSession();
  const [code, setCode] = useState((params.code ?? '').toUpperCase());
  const [nickname, setNickname] = useState('');
  const [team, setTeam] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    const r = await call<{ token: string }>('player:join', { code: code.trim(), nickname, team });
    setBusy(false);
    if (!r.ok) return setError(r.error ?? 'No se pudo entrar.');
    saveSession({ code: code.trim().toUpperCase(), token: r.data!.token, nickname: nickname.trim() });
    nav('/play');
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 py-8">
      <header className="text-center">
        <Logo size="lg" />
        <p className="mt-3 text-white/80">Apuesta lo que crees del shopper colombiano. Después, la data revela la verdad.</p>
      </header>

      {existing && (
        <div className="rounded-2xl bg-turq/15 p-4 ring-1 ring-turq/50">
          <p className="mb-3">
            Ya estás jugando como <b>{existing.nickname}</b> en la sala <b>{existing.code}</b>.
          </p>
          <Button className="w-full" onClick={() => nav('/play')}>
            Volver a mi partida
          </Button>
        </div>
      )}

      <form onSubmit={submit} className="flex flex-col gap-4 rounded-3xl bg-deeper/80 p-5 ring-1 ring-white/10">
        <label className="flex flex-col gap-1.5">
          <span className="font-semibold">Código de sala</span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
            placeholder="ABC123"
            autoCapitalize="characters"
            autoComplete="off"
            required
            className="min-h-14 rounded-2xl bg-white px-4 text-center text-3xl font-black tracking-[0.3em] text-deepest uppercase"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="font-semibold">Tu apodo</span>
          <input
            value={nickname}
            onChange={(e) => setNickname([...e.target.value].slice(0, MAX_NICK).join(''))}
            placeholder="Ej: ShopperPro"
            autoComplete="nickname"
            required
            minLength={2}
            className="min-h-14 rounded-2xl bg-white px-4 text-xl font-bold text-deepest"
          />
          <span className="text-right text-xs text-white/60">
            {[...nickname].length}/{MAX_NICK}
          </span>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="font-semibold">
            Equipo o área <span className="font-normal text-white/60">(opcional)</span>
          </span>
          <input
            value={team}
            onChange={(e) => setTeam(e.target.value.slice(0, 24))}
            placeholder="Ej: Trade Marketing"
            className="min-h-12 rounded-2xl bg-white px-4 text-lg text-deepest"
          />
        </label>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" variant="pink" disabled={busy || code.length !== 6 || nickname.trim().length < 2} className="min-h-14 text-xl">
          {busy ? 'Entrando…' : '¡Entrar a jugar!'}
        </Button>
      </form>

      <section className="rounded-3xl bg-white/5 p-5 text-sm text-white/80 ring-1 ring-white/10">
        <h2 className="mb-2 text-base font-bold text-white">¿Cómo se juega?</h2>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Arrancas con 1.000 puntos.</li>
          <li>En cada pregunta eliges tu respuesta y apuestas entre el 10% y todo tu saldo.</li>
          <li>Cada fase multiplica más: x1 · x1,25 · x1,5 · x2 · y la Pregunta de Oro x3.</li>
          <li>Si no respondes a tiempo, pierdes el 10%.</li>
        </ol>
      </section>

      <footer className="text-center">
        <Link to="/host" className="text-sm text-white/70 underline underline-offset-4 hover:text-white">
          Soy presentador
        </Link>
      </footer>
    </main>
  );
}
