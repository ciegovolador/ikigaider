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

// --- schema versioning (Postel: liberal accept, conservative produce) --------
// The journey.sqlite file is portable across the web app and the downloaded
// skill, which version independently. We stamp PRAGMA user_version = MAJOR*1000
// + MINOR so any context can tell what wrote a file:
//   • unmarked file (user_version 0, everything exported before versioning) =
//     the v1.0 baseline; we apply forward migrations then stamp it.
//   • same MAJOR, newer MINOR  -> READ as-is (additive columns we don't know are
//     ignored). We do NOT rewrite its version — never produce a shape an even
//     newer reader didn't expect. (don't-break-userspace; additive = soft fork)
//   • same MAJOR, older MINOR  -> run forward migrations, then stamp current.
//   • newer MAJOR              -> REFUSE (a breaking change); never corrupt it.
// The migration LADDER is deliberately empty until a real v1.1 schema change —
// the framework is here; the process is deferred (CRAN-style deprecation when
// it lands).
const SCHEMA_MAJOR = 1;
const SCHEMA_MINOR = 0;
const SCHEMA_UV = SCHEMA_MAJOR * 1000 + SCHEMA_MINOR;

// Forward-only migrations within the current MAJOR. Key = target MINOR; each
// upgrades from (key-1) to key. Empty by design until the first additive change.
const MIGRATIONS = {
  // 1: (db) => db.run('ALTER TABLE scores ADD COLUMN note TEXT'),
};

function readUserVersion(db) {
  const r = db.exec('PRAGMA user_version');
  return r.length && r[0].values.length ? Number(r[0].values[0][0]) : 0;
}
function setUserVersion(db, n) {
  // PRAGMA can't be parameterised; Number() guards against injection.
  db.run(`PRAGMA user_version = ${Number(n)}`);
}
function runMigrations(db, fromMinor) {
  for (let m = fromMinor + 1; m <= SCHEMA_MINOR; m++) {
    if (MIGRATIONS[m]) MIGRATIONS[m](db);
  }
}

// Reconcile an opened DB's version with this build. Throws on a newer MAJOR.
function migrate(db) {
  const uv = readUserVersion(db);
  if (uv === 0) {
    // Pre-versioning file IS the v1.0 baseline schema.
    runMigrations(db, 0);
    setUserVersion(db, SCHEMA_UV);
    return;
  }
  const fileMajor = Math.floor(uv / 1000);
  const fileMinor = uv % 1000;
  if (fileMajor > SCHEMA_MAJOR) {
    throw new Error(
      `This journey was written by a newer ikigaider (v${fileMajor}.x). ` +
      `Update the app or skill to open it.`
    );
  }
  if (fileMajor < SCHEMA_MAJOR) {
    // No major migration defined yet (current MAJOR is 1; only uv 0 is below).
    throw new Error(`Unsupported journey version v${fileMajor}.${fileMinor}.`);
  }
  if (fileMinor > SCHEMA_MINOR) return; // liberal accept: read newer-minor as-is
  runMigrations(db, fileMinor);
  if (fileMinor < SCHEMA_MINOR) setUserVersion(db, SCHEMA_UV);
}

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
    db.run(SCHEMA);   // CREATE TABLE IF NOT EXISTS — safe on fresh and existing files
    migrate(db);      // then reconcile the version (stamp / upgrade / refuse)
  }

  // Current schema version of the open file (MAJOR*1000 + MINOR). Diagnostics + tests.
  userVersion() { return readUserVersion(this.db); }

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
  export() { return this.db.export(); } // Uint8Array (full — used for the local reload cache)

  // Portable export for HANDOFF (download / skill): strips the config table so a
  // shared journey never carries the user's API key or endpoint. sql.js is
  // synchronous and single-threaded, so the delete→export→restore runs with no
  // interruption window — the live config is intact after the call.
  exportSanitized() {
    const cfg = this.getConfig();
    this.db.run('DELETE FROM config');
    const bytes = this.db.export();
    if (cfg) this.setConfig(cfg);
    return bytes;
  }
}

export function createDb(SQL, bytes) {
  return new IkigaiStore(bytes ? new SQL.Database(bytes) : new SQL.Database());
}

export { IkigaiStore };
