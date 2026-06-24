// sessions.js — the session library's persistence, in IndexedDB.
//
// persist.js cached ONE journey in localStorage (5MB, sync, base64). A library of
// named journeys + per-session chat outgrows that, so sessions live in IndexedDB,
// the standard browser store for multiple binary blobs (raw Uint8Array, no base64).
//
// CQRS: reads (queries) and writes (commands) are split and never cross — a query
// never mutates, a command returns ids/void and is never used as a read model.
//
//   QUERIES   listSessions() · getBytes(id) · getActiveId()
//   COMMANDS  putSession({id,name,bytes}) · renameSession(id,name) ·
//             deleteSession(id) · setActiveId(id) · migrateLegacy(bytes)
//
// A "session" row = { id, name, createdAt, updatedAt, bytes } where bytes is a full
// portable journey SQLite export. One id is "active" (kept in the meta store).

const DB_NAME = 'ikigaider';
const DB_VERSION = 1;
const SESSIONS = 'sessions';
const META = 'meta';
const ACTIVE = 'activeId';

const uid = () =>
  globalThis.crypto?.randomUUID?.() ?? `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const now = () => new Date().toISOString();

let dbPromise = null;
function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SESSIONS)) db.createObjectStore(SESSIONS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'k' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

// Promise-ify a single IDBRequest. One request per call keeps reads/writes atomic
// enough for a single-user local store (no cross-tab coordination in v1).
const pReq = (request) =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
const store = (db, name, mode) => db.transaction(name, mode).objectStore(name);

// --- QUERIES (pure reads; never mutate) ------------------------------------
// Metadata only (no bytes) so listing a big library stays light; newest first.
export async function listSessions() {
  const db = await openDb();
  const rows = await pReq(store(db, SESSIONS, 'readonly').getAll());
  return rows
    .map(({ id, name, createdAt, updatedAt }) => ({ id, name, createdAt, updatedAt }))
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

export async function getBytes(id) {
  const db = await openDb();
  const row = await pReq(store(db, SESSIONS, 'readonly').get(id));
  return row ? row.bytes : null;
}

export async function getActiveId() {
  const db = await openDb();
  const row = await pReq(store(db, META, 'readonly').get(ACTIVE));
  return row ? row.v : null;
}

// --- COMMANDS (writes; return id/void, never a read model) -----------------
// Upsert. Preserves name + createdAt when saving an existing session's bytes;
// always refreshes updatedAt. Returns the id (new or given).
export async function putSession({ id, name, bytes, createdAt } = {}) {
  const db = await openDb();
  const sid = id || uid();
  const existing = id ? await pReq(store(db, SESSIONS, 'readonly').get(id)) : null;
  const row = {
    id: sid,
    name: name ?? existing?.name ?? 'Untitled',
    bytes,
    createdAt: existing?.createdAt || createdAt || now(),
    updatedAt: now(),
  };
  await pReq(store(db, SESSIONS, 'readwrite').put(row));
  return sid;
}

export async function renameSession(id, name) {
  const db = await openDb();
  const row = await pReq(store(db, SESSIONS, 'readonly').get(id));
  if (!row) return;
  row.name = name;
  row.updatedAt = now();
  await pReq(store(db, SESSIONS, 'readwrite').put(row));
}

export async function deleteSession(id) {
  const db = await openDb();
  await pReq(store(db, SESSIONS, 'readwrite').delete(id));
}

export async function setActiveId(id) {
  const db = await openDb();
  await pReq(store(db, META, 'readwrite').put({ k: ACTIVE, v: id }));
}

// One-time lift of the legacy single-journey localStorage cache into the library:
// only when the library is still empty. Returns the new active id, or null if the
// library already has sessions (nothing to migrate). Don't-break-userspace.
export async function migrateLegacy(bytes, name = 'My journey') {
  if (!bytes) return null;
  if ((await listSessions()).length) return null;
  const id = await putSession({ name, bytes });
  await setActiveId(id);
  return id;
}

// Test seam only: drop the memoised connection so a fresh IDBFactory takes effect.
export function _resetForTests() { dbPromise = null; }
