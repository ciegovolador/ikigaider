// Browser-only wiring for sql.js: loads the WASM (via Vite's ?url asset) and
// builds a store. Kept separate from sqlite.js so the store logic stays
// node-safe (tests, seed script). SOLID: one module, one concern.
import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { createDb } from './sqlite.js';

export async function initBrowserDb(bytes) {
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  return createDb(SQL, bytes);
}
