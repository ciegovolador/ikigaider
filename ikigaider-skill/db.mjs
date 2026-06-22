// db.mjs — the Claude Code door's persistence wiring. The web door opens the
// portable journey.sqlite through OPFS (sqlite-browser.js); this opens the SAME
// file through Node's fs. Both wrap the identical engine `createDb` — the store
// logic, schema, and version reconciliation live in engine/sqlite.mjs, shared.
//
// Why vendored wasm: a downloaded skill has no node_modules, so the seed-demo
// pattern (`require.resolve('sql.js/...')`) cannot resolve. build-skill.mjs
// vendors sql-wasm.{js,wasm} into engine/, and we point sql.js's locateFile at
// the binary RELATIVE TO THIS FILE so it loads wherever the skill is unzipped.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createDb } from './engine/sqlite.mjs';

const here = dirname(fileURLToPath(import.meta.url));
// sql-wasm.js is a CommonJS UMD module; require it from this ESM file.
const initSqlJs = createRequire(import.meta.url)('./engine/sql-wasm.js');

let SQL; // sql.js initialises once per process; cache the module.
async function getSQL() {
  if (!SQL) {
    SQL = await initSqlJs({
      locateFile: () => resolve(here, 'engine', 'sql-wasm.wasm'),
    });
  }
  return SQL;
}

// The shared journey file. Override with --db; defaults under the user's home so
// every skill invocation reads/writes one portable journey.
export const DEFAULT_DB = resolve(homedir(), '.ikigaider', 'journey.sqlite');

// Open the store at `path`. Missing file -> a fresh, version-stamped db (caller
// persists it). Existing file -> reconciled by engine migrate() (refuses a newer
// MAJOR). A corrupt file surfaces a named error rather than a raw sql.js throw.
export async function openDb(path = DEFAULT_DB) {
  const sql = await getSQL();
  if (!existsSync(path)) return createDb(sql);
  let bytes;
  try {
    bytes = readFileSync(path);
  } catch (e) {
    throw new Error(`Could not read journey at ${path}: ${e.message}`);
  }
  try {
    return createDb(sql, new Uint8Array(bytes));
  } catch (e) {
    // engine migrate() throws a clear message for a newer-MAJOR file; pass it
    // through. Anything else is genuine corruption — name it, never clobber.
    if (/newer ikigaider|Unsupported journey/.test(e.message)) throw e;
    throw new Error(`Journey at ${path} is unreadable (corrupt or not an ikigaider file): ${e.message}`);
  }
}

// Persist `store` to `path`, creating the parent dir. `sanitized` strips the
// config table so a shared/exported journey carries no api_key/endpoint.
export function writeDb(store, path = DEFAULT_DB, { sanitized = false } = {}) {
  const bytes = sanitized ? store.exportSanitized() : store.export();
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, Buffer.from(bytes));
  } catch (e) {
    throw new Error(`Could not write journey to ${path}: ${e.message}`);
  }
  return path;
}
