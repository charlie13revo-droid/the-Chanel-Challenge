// Genera data/channel_challenge.sql: esquema + banco de preguntas semilla como plantilla (sala "TEMPLATE").
// Uso: npm run db:sql
import { readFileSync, writeFileSync } from 'node:fs';
import { seed, seedQuestionRow } from '../server/db.ts';

const q = (v: unknown) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const out: string[] = [
  '-- The Channel Challenge: esquema + banco de preguntas (generado con `npm run db:sql`).',
  '-- El servidor crea las tablas automáticamente y copia este banco a cada sala nueva;',
  '-- este script sirve para inspeccionar o cargar los datos manualmente (SQLite / Postgres).',
  '',
  readFileSync(new URL('../server/schema.sql', import.meta.url), 'utf8'),
  '',
  "-- Sala plantilla con el banco semilla (PIN no utilizable: hash vacío).",
  "INSERT INTO rooms (id, code, host_pin_hash, created_at) VALUES ('template', 'TMPLT0', 'x:x', 0);",
];
for (const p of seed.phases) {
  out.push(
    `INSERT INTO phases (room_id, phase_id, title, multiplier, color, channels, drivers, phrase) VALUES ('template', ${p.id}, ${q(p.title)}, ${p.multiplier}, ${q(p.color)}, ${q(JSON.stringify(p.channels))}, ${q(p.drivers)}, ${q(p.phrase)});`,
  );
  p.questions.forEach((sq, i) => {
    const r = seedQuestionRow(sq);
    out.push(
      `INSERT INTO questions (room_id, phase, ord, type, prompt, options, answer, unit, min, max, step, reveal, host_note) VALUES ('template', ${p.id}, ${i}, ${q(r.type)}, ${q(r.prompt)}, ${q(r.options)}, ${q(r.answer)}, ${q(r.unit)}, ${q(r.min)}, ${q(r.max)}, ${q(r.step)}, ${q(r.reveal)}, ${q(r.host_note)});`,
    );
  });
}
writeFileSync(new URL('../data/channel_challenge.sql', import.meta.url), out.join('\n') + '\n');
console.log('✔ data/channel_challenge.sql generado');
