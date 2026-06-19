// sqlite.js — portable persistence on a single SQLite file (sql.js / WASM).
//
// SOLID note: the store logic (createDb) takes an already-initialised SQL
// module, so it is testable in Node. The browser wiring (initBrowserDb) is the
// only Vite/WASM-specific bit. The file the user exports/imports IS the source
// of truth — no hidden server state.

import { AXES } from '../lib/ikigai.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  base_url TEXT, api_key TEXT, model TEXT
);
CREATE TABLE IF NOT EXISTS activities (
  id TEXT PRIMARY KEY, name TEXT NOT NULL,
  created_at TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  activity_id TEXT NOT NULL, ts TEXT NOT NULL,
  love REAL, good REAL, world REAL, paid REAL,
  conf_love REAL, conf_good REAL, conf_world REAL, conf_paid REAL,
  source TEXT
);
CREATE TABLE IF NOT EXISTS moves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL, mode TEXT, submode TEXT,
  focal_activity_id TEXT, rationale TEXT, assignment TEXT
);
`;

const uid = () =>
  (globalThis.crypto?.randomUUID?.() ?? `a_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);

const now = () => new Date().toISOString();

function rows(db, sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const out = [];
  while (stmt.step()) out.push(stmt.getAsObject());
  stmt.free();
  return out;
}

class IkigaiStore {
  constructor(db) {
    this.db = db;
    db.run(SCHEMA);
  }

  // --- config ---
  getConfig() {
    return rows(this.db, 'SELECT base_url, api_key, model FROM config WHERE id = 1')[0] || null;
  }
  setConfig({ base_url = '', api_key = '', model = '' }) {
    this.db.run(
      `INSERT INTO config (id, base_url, api_key, model) VALUES (1, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET base_url=excluded.base_url,
         api_key=excluded.api_key, model=excluded.model`,
      [base_url, api_key, model]
    );
  }

  // --- activities (shaped for policy: {id,name,scores,conf,archived}) ---
  addActivity(name, id = uid()) {
    this.db.run('INSERT INTO activities (id, name, created_at, archived) VALUES (?,?,?,0)',
      [id, name, now()]);
    return id;
  }
  archiveActivity(id, archived = true) {
    this.db.run('UPDATE activities SET archived = ? WHERE id = ?', [archived ? 1 : 0, id]);
  }
  listActivities() {
    return rows(this.db, 'SELECT id, name, archived FROM activities ORDER BY created_at').map((a) => {
      const latest = rows(this.db,
        'SELECT * FROM scores WHERE activity_id = ? ORDER BY id DESC LIMIT 1', [a.id])[0];
      const scores = {}, conf = {};
      for (const ax of AXES) {
        scores[ax] = latest ? latest[ax] : 0;
        conf[ax] = latest ? latest[`conf_${ax}`] : 0.5;
      }
      return { id: a.id, name: a.name, archived: !!a.archived, scores, conf };
    });
  }

  // --- scores / trajectory ---
  addScore(activityId, scores, conf = {}, source = 'coach') {
    this.db.run(
      `INSERT INTO scores
        (activity_id, ts, love, good, world, paid, conf_love, conf_good, conf_world, conf_paid, source)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [activityId, now(), scores.love, scores.good, scores.world, scores.paid,
        conf.love ?? 0.5, conf.good ?? 0.5, conf.world ?? 0.5, conf.paid ?? 0.5, source]
    );
  }
  scoresFor(activityId) {
    return rows(this.db, 'SELECT ts, love, good, world, paid FROM scores WHERE activity_id = ? ORDER BY id',
      [activityId]).map((r) => ({ ts: r.ts, scores: { love: r.love, good: r.good, world: r.world, paid: r.paid } }));
  }

  // --- moves (decision log; focal change = teleport) ---
  addMove(m) {
    this.db.run('INSERT INTO moves (ts, mode, submode, focal_activity_id, rationale, assignment) VALUES (?,?,?,?,?,?)',
      [now(), m.mode, m.submode, m.focusId ?? null, m.rationale ?? '', m.assignmentHint ?? '']);
  }
  listMoves() {
    return rows(this.db, 'SELECT * FROM moves ORDER BY id');
  }

  // --- portable file ---
  export() { return this.db.export(); } // Uint8Array
}

export function createDb(SQL, bytes) {
  return new IkigaiStore(bytes ? new SQL.Database(bytes) : new SQL.Database());
}

export { IkigaiStore };
