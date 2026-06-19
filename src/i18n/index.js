// i18n — a tiny, dependency-free translation layer. UI-only: the pure engine
// (ikigai.js / policy.js) stays locale-agnostic. Pure logic lives here (so it's
// unit-testable with no React); the React provider is in ./provider.jsx.
import { classify } from '../lib/ikigai.js';
import en from './en.js';
import es from './es.js';

export const LOCALES = ['en', 'es'];
export const LOCALE_LABELS = { en: 'English', es: 'Español' };
const DICTS = { en, es };
export const STORAGE_KEY = 'ikigaider.locale';

// 16-state names per locale (mirror STATES in ikigai.js, kept here so the engine
// stays English for the LLM contract while the UI can localize the label).
const STATE_NAMES = {
  en: {}, // English falls through to the engine's STATES[].name (passed as fallback)
  es: {
    '0000': 'Perdido', '1000': 'Ensueño', '0100': 'Talento ocioso', '0010': 'Vacío altruista',
    '0001': 'Sueldo', '1100': 'Pasión', '1010': 'Misión', '0101': 'Profesión',
    '0011': 'Vocación', '1001': 'Capricho', '0110': 'Deber', '1110': 'Feliz, sin riqueza',
    '1101': 'Inútil pero satisfecho', '1011': 'Entusiasmado pero inseguro',
    '0111': 'Cómodo pero vacío', '1111': 'IKIGAI',
  },
};

export function normalizeLocale(tag) {
  const base = String(tag || '').toLowerCase().split('-')[0];
  return LOCALES.includes(base) ? base : 'en';
}

export function detectLocale(navLang) {
  return normalizeLocale(navLang ?? (typeof navigator !== 'undefined' ? navigator.language : 'en'));
}

export function loadLocale() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && LOCALES.includes(saved)) return saved;
  } catch { /* ignore */ }
  return detectLocale();
}

export function saveLocale(loc) {
  try { localStorage.setItem(STORAGE_KEY, loc); } catch { /* ignore */ }
}

// makeT(locale) -> t(key, vars). Falls back: locale -> en -> the key itself.
// Interpolates {name} tokens from vars.
export function makeT(locale) {
  const dict = DICTS[locale] || DICTS.en;
  return (key, vars) => {
    let s = dict[key] ?? DICTS.en[key] ?? key;
    if (vars) for (const k of Object.keys(vars)) s = s.replaceAll(`{${k}}`, String(vars[k]));
    return s;
  };
}

// Localized 16-state name, falling back to the engine's English name.
export function stateName(locale, key, fallback) {
  return STATE_NAMES[locale]?.[key] ?? fallback ?? key;
}

// A natural, COMPLETE sentence describing a clicked map point — never a dangling
// "it's" lead-in. Pure: takes scores + a t() so it localizes.
export function placementDraft(scores, t) {
  const st = classify(scores);
  const pos = st.present.map((a) => t(`draft.pos.${a}`));
  const neg = st.missing.map((a) => t(`draft.neg.${a}`));
  if (!pos.length && !neg.length) return t('draft.empty');
  let s = pos.join(', ');
  if (neg.length) s = s ? `${s} ${t('draft.but')} ${neg.join(', ')}` : neg.join(', ');
  return `${s.charAt(0).toUpperCase()}${s.slice(1)}.`;
}
