// persist.js — same-machine auto-cache of the SQLite bytes in localStorage so
// a page reload doesn't wipe config/journey. The exported .sqlite file remains
// the portable, cross-machine source of truth; this is just reload survival.

const KEY = 'ikigaider.db';

function toB64(bytes) {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(s);
}

function fromB64(b64) {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes;
}

export function saveDbBytes(bytes) {
  try { localStorage.setItem(KEY, toB64(bytes)); } catch { /* quota / private mode */ }
}

export function loadDbBytes() {
  try {
    const b = localStorage.getItem(KEY);
    return b ? fromB64(b) : null;
  } catch { return null; }
}
