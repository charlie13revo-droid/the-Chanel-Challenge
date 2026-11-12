import { io, Socket } from 'socket.io-client';
import type { Ack } from '../../../shared/types.ts';

export const socket: Socket = io({
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionDelay: 500,
  reconnectionDelayMax: 4000,
});

/** Emite un evento y espera la respuesta del servidor (con timeout). */
export function call<T = unknown>(event: string, payload?: unknown, timeoutMs = 8000): Promise<Ack<T>> {
  return new Promise((resolve) => {
    socket.timeout(timeoutMs).emit(event, payload, (err: Error | null, res: Ack<T>) => {
      if (err) resolve({ ok: false, error: 'Sin respuesta del servidor. Revisa tu conexión.' });
      else resolve(res);
    });
  });
}
