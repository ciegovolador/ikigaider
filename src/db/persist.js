// persist.js — legacy single-journey cache + the GLOBAL (device-level) config.
//
// History: v1 cached one journey in localStorage['ikigaider.db']. The session
// library (sessions.js, IndexedDB) now owns journeys, so this module keeps only:
//   • loadDbBytes/clearDbBytes — read + retire the legacy key, for one-time
//     migration into the library (don't-break-userspace).
//   • load/saveGlobalConfig — the LLM endpoint/key/model live OUTSIDE any journey
//     (switching sessions must not change your setup; exports are already config-free).

const KEY = 'ikigaider.db';          // legacy single-journey blob (migrated away)
const CONFIG_KEY = 'ikigaider.config'; // device-level LLM config (global)

function fromB64(b64) {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes;
}

// --- legacy journey (read-only + retire) -----------------------------------
export function loadDbBytes() {
  try {
    const b = localStorage.getItem(KEY);
    return b ? fromB64(b) : null;
  } catch { return null; }
}
export function clearDbBytes() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

// --- global config ---------------------------------------------------------
export function loadGlobalConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
export function saveGlobalConfig({ base_url = '', api_key = '', model = '' } = {}) {
  try { localStorage.setItem(CONFIG_KEY, JSON.stringify({ base_url, api_key, model })); } catch { /* quota */ }
}
