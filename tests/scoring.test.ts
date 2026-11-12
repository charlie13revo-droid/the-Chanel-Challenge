import { test } from 'node:test';
import assert from 'node:assert/strict';
import { closestWinner, score } from '../server/scoring.ts';
import { minBet } from '../shared/types.ts';

const base = { bet: 200, balance: 1000, multiplier: 1.25 };

test('apuesta mínima = 10% del saldo, redondeada hacia arriba', () => {
  assert.equal(minBet(1000), 100);
  assert.equal(minBet(345), 35);
  assert.equal(minBet(0), 0);
});

test('sin respuesta: pierde el 10% del saldo', () => {
  assert.deepEqual(score({ ...base, type: 'intruso', answer: 'A', value: null }), { delta: -100, isCorrect: false });
});

test('mito/realidad e intruso: +G o −apuesta', () => {
  assert.equal(score({ ...base, type: 'mito_realidad', answer: 'MITO', value: 'MITO' }).delta, 250);
  assert.equal(score({ ...base, type: 'mito_realidad', answer: 'MITO', value: 'REALIDAD' }).delta, -200);
  assert.equal(score({ ...base, type: 'intruso', answer: 'B', value: 'B', multiplier: 3 }).delta, 600);
});

test('ranking: 4 bien = +1,5G; 2 bien = 0; 0–1 bien = −apuesta', () => {
  const answer = ['A', 'B', 'C', 'D'];
  const s = (value: string[]) => score({ ...base, multiplier: 1, type: 'ranking', answer, value }).delta;
  assert.equal(s(['A', 'B', 'C', 'D']), 300);
  assert.equal(s(['A', 'B', 'D', 'C']), 0);
  assert.equal(s(['A', 'C', 'D', 'B']), -200);
  assert.equal(s(['D', 'C', 'B', 'A']), -200);
});

test('numérico: ≤5% = +2G; ≤15% = +G; ≤30% = 0; >30% = −apuesta', () => {
  const s = (value: number) => score({ ...base, multiplier: 1, type: 'numeric', answer: 100, value }).delta;
  assert.equal(s(105), 400);
  assert.equal(s(95), 400);
  assert.equal(s(115), 200);
  assert.equal(s(130), 0);
  assert.equal(s(131), -200);
  assert.equal(s(57.2), -200);
});

test('numérico con decimales (57,2 veces)', () => {
  const r = score({ bet: 100, balance: 500, multiplier: 2, type: 'numeric', answer: 57.2, value: 60 });
  assert.equal(r.delta, 400); // error 4,9% → +2G = 2 × 100 × 2
});

test('bono al más cercano: empate se decide por velocidad', () => {
  const w = closestWinner([
    { id: 'a', error: 0.1, responseMs: 5000 },
    { id: 'b', error: 0.02, responseMs: 9000 },
    { id: 'c', error: 0.02, responseMs: 3000 },
  ]);
  assert.equal(w?.id, 'c');
  assert.equal(closestWinner([]), null);
});

test('ranking: los ítems nunca se muestran en el orden correcto y el barajado es estable', async () => {
  const { presentationOrder } = await import('../server/game.ts');
  const items = ['D1', 'Ara', 'Ísimo', 'Conveniencia'];
  for (let id = 1; id < 200; id++) {
    const a = presentationOrder(items, items, id);
    assert.notDeepEqual(a, items);
    assert.deepEqual([...a].sort(), [...items].sort());
    assert.deepEqual(presentationOrder(items, items, id), a);
  }
});
