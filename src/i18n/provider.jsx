// React glue for i18n: a context that holds the current locale + a t() helper.
// Locale starts from the browser (or a previously persisted choice) and is saved
// only when the user actively switches it.
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { LOCALES, loadLocale, saveLocale, makeT } from './index.js';

const LocaleContext = createContext(null);

export function LocaleProvider({ children }) {
  const [locale, setLocaleState] = useState(loadLocale);
  const t = useMemo(() => makeT(locale), [locale]);

  useEffect(() => {
    if (typeof document !== 'undefined') document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = (loc) => {
    const next = LOCALES.includes(loc) ? loc : 'en';
    saveLocale(next); // persist only once the user actually picks one
    setLocaleState(next);
  };

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, t]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale must be used within LocaleProvider');
  return ctx;
}
