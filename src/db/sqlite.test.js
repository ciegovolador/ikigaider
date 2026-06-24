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

describe('schema versioning (Postel)', () => {
  // Craft a file at a chosen user_version: build it, force the pragma AFTER
  // construction (so migrate() doesn't re-stamp), then export the bytes.
  const fileAtVersion = (uv, seed) => {
    const db = createDb(SQL);
    if (seed) seed(db);
    db.db.run(`PRAGMA user_version = ${uv}`);
    return db.export();
  };

  it('stamps a fresh db with the current schema version', () => {
    const db = createDb(SQL);
    expect(db.userVersion()).toBe(1001); // MAJOR 1 * 1000 + MINOR 1
  });

  it('forward-migrates an unmarked (pre-versioning) file to current, data intact', () => {
    // demo.sqlite and every pre-versioning journey read user_version 0; opening
    // them adds the v1.1 messages table (additive) and stamps 1001.
    const bytes = fileAtVersion(0, (db) => db.addActivity('legacy'));
    const restored = createDb(SQL, bytes);
    expect(restored.userVersion()).toBe(1001);
    expect(restored.listActivities()[0].name).toBe('legacy');
    expect(restored.listMessages()).toEqual([]); // messages table now present
  });

  it('reads a newer-MINOR file as-is without rewriting its version (liberal accept)', () => {
    const bytes = fileAtVersion(1002, (db) => db.addActivity('from v1.2'));
    const restored = createDb(SQL, bytes);
    expect(restored.userVersion()).toBe(1002); // left untouched (conservative produce)
    expect(restored.listActivities()[0].name).toBe('from v1.2');
  });

  it('refuses a newer-MAJOR file instead of corrupting it', () => {
    const bytes = fileAtVersion(2000, (db) => db.addActivity('from v2'));
    expect(() => createDb(SQL, bytes)).toThrow(/newer ikigaider \(v2\.x\)/);
  });
});

describe('messages (v1.1 conversation persistence)', () => {
  it('round-trips messages with move JSON, in order, and survives export/import', () => {
    const db = createDb(SQL);
    db.addMessage('user', 'I play piano');
    db.addMessage('coach', 'keep going', { mode: 'exploit', submode: 'keep' });
    db.addMessage('_context', '- gig: Paycheck (ikigai 0.05, weakest love 0.1)');

    const restored = createDb(SQL, db.export());
    const msgs = restored.listMessages();
    expect(msgs.map((m) => m.role)).toEqual(['user', 'coach', '_context']);
    expect(msgs[1].move).toEqual({ mode: 'exploit', submode: 'keep' });
    expect(msgs[0].move).toBeUndefined();
    expect(msgs[2].text).toContain('Paycheck');
  });
});

describe('exportSanitized — no secrets travel (outside-voice fix)', () => {
  it('strips config from the exported file but keeps the journey', () => {
    const db = createDb(SQL);
    db.setConfig({ base_url: 'http://secret', api_key: 'sk-LEAK', model: 'm' });
    const id = db.addActivity('craft');
    db.addScore(id, makeScores({ love: 0.9 }));

    const restored = createDb(SQL, db.exportSanitized());
    expect(restored.getConfig()).toBeNull();            // no api_key/base_url travels
    expect(restored.listActivities()[0].name).toBe('craft'); // journey intact
  });
  it('leaves the live config intact after a sanitized export', () => {
    const db = createDb(SQL);
    db.setConfig({ base_url: 'u', api_key: 'k', model: 'm' });
    db.exportSanitized();
    expect(db.getConfig().model).toBe('m'); // restored in place
  });
});
