// Generates public/demo.sqlite — an offline demo journey so the app shows a
// populated map + trajectory with no LLM. Run: node scripts/seed-demo.mjs
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import initSqlJs from 'sql.js';
import { createDb } from '../src/db/sqlite.js';
import { makeScores } from '../src/lib/ikigai.js';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));

const SQL = await initSqlJs({ locateFile: () => require.resolve('sql.js/dist/sql-wasm.wasm') });
const db = createDb(SQL);

const job = db.addActivity('backend at fintech');
db.addScore(job, makeScores({ love: 0.2, good: 0.85, world: 0.6, paid: 0.9 }),
  { love: 0.9, good: 0.9, world: 0.7, paid: 0.9 }, 'assess');

// music tools: a passion project that improves over a few turns (trajectory).
const music = db.addActivity('music tools');
db.addScore(music, makeScores({ love: 0.9, good: 0.5, world: 0.4, paid: 0.2 }),
  { love: 0.9, good: 0.6, world: 0.5, paid: 0.6 }, 'assess');
db.addScore(music, makeScores({ love: 0.9, good: 0.6, world: 0.5, paid: 0.45 }),
  { love: 0.9, good: 0.7, world: 0.6, paid: 0.6 }, 'coach');
db.addScore(music, makeScores({ love: 0.9, good: 0.7, world: 0.6, paid: 0.6 }),
  { love: 0.9, good: 0.8, world: 0.7, paid: 0.7 }, 'coach');

db.addMove({ mode: 'exploit', submode: 'improve', focusId: music,
  rationale: 'music tools is Passion — weakest axis is pay. Charge for one tool.',
  assignmentHint: 'Put a price on one tool this month.' });

mkdirSync(resolve(here, '../public'), { recursive: true });
writeFileSync(resolve(here, '../public/demo.sqlite'), Buffer.from(db.export()));
console.log('wrote public/demo.sqlite');
