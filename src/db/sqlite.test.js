import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'node:module';
import initSqlJs from 'sql.js';
import { createDb } from './sqlite.js';
import { makeScores } from '../lib/ikigai.js';

const require = createRequire(import.meta.url);

let SQL;
beforeAll(async () => {
  // In Node, sql.js loads the wasm from the filesystem path locateFile returns.
  const wasmPath = require.resolve('sql.js/dist/sql-wasm.wasm');
  SQL = await initSqlJs({ locateFile: () => wasmPath });
});

describe('IkigaiStore', () => {
  it('stores config and reads it back', () => {
    const db = createDb(SQL);
    db.setConfig({ base_url: 'http://localhost:8080/v1', api_key: 'k', model: 'local' });
    expect(db.getConfig().model).toBe('local');
  });

  it('tracks activities with their latest scores', () => {
    const db = createDb(SQL);
    const id = db.addActivity('teaching');
    db.addScore(id, makeScores({ love: 0.8, good: 0.6, world: 0.7, paid: 0.4 }),
      { love: 0.9, good: 0.9, world: 0.8, paid: 0.7 });
    const a = db.listActivities()[0];
    expect(a.name).toBe('teaching');
    expect(a.scores.love).toBeCloseTo(0.8);
    expect(a.conf.paid).toBeCloseTo(0.7);
  });

  it('keeps a per-activity trajectory ordered by time', () => {
    const db = createDb(SQL);
    const id = db.addActivity('writing');
    db.addScore(id, makeScores({ love: 0.5 }));
    db.addScore(id, makeScores({ love: 0.7 }));
    const traj = db.scoresFor(id);
    expect(traj.map((t) => t.scores.love)).toEqual([0.5, 0.7]);
  });

  it('survives an export -> import round-trip', () => {
    const db = createDb(SQL);
    db.setConfig({ base_url: 'u', api_key: 'k', model: 'm' });
    const id = db.addActivity('craft');
    db.addScore(id, makeScores({ love: 0.9, good: 0.9, world: 0.9, paid: 0.9 }));
    db.addMove({ mode: 'exploit', submode: 'keep', focusId: id, rationale: 'r', assignmentHint: 'a' });

    const bytes = db.export();
    const restored = createDb(SQL, bytes);

    expect(restored.getConfig().model).toBe('m');
    expect(restored.listActivities()[0].name).toBe('craft');
    expect(restored.listActivities()[0].scores.love).toBeCloseTo(0.9);
    expect(restored.listMoves()[0].submode).toBe('keep');
  });
});
