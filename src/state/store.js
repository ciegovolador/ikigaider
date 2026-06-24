// store.js — orchestration + the session library's React binding. Binds the pure
// libs (ikigai/policy/llm), the active journey DB, the IndexedDB session store,
// and React together. CQRS: it DISPATCHES commands (session/journey writes) and
// SELECTS from queries (portfolio, sessions, projections); it never mixes them.

import { useCallback, useEffect, useRef, useState } from 'react';
import { initBrowserDb } from '../db/sqlite-browser.js';
import { loadDbBytes, clearDbBytes, loadGlobalConfig, saveGlobalConfig } from '../db/persist.js';
import {
  listSessions as idbList, getBytes as idbGetBytes, getActiveId as idbGetActiveId,
  putSession, setActiveId as idbSetActive, migrateLegacy,
  renameSession as idbRename, deleteSession as idbDelete,
} from '../db/sessions.js';
import { decideMove, bestActivity, uncertainty } from '../lib/policy.js';
import { assess, coach, onProviderFallback } from '../lib/llm.js';
import { ingest as orchIngest, runTurn as orchRunTurn } from '../lib/orchestrator.js';
import { onLoadProgress, DEFAULT_BROWSER_MODEL, DEFAULT_BROWSER_BASE } from '../lib/webllm.js';
import { placementDraft } from '../i18n/index.js';

// A fresh user defaults to the zero-setup in-browser engine — WebGPU if available,
// else the CPU fallback. No endpoint, no key: send a message and it just coaches.
const DEFAULT_CONFIG = { base_url: DEFAULT_BROWSER_BASE, api_key: '', model: DEFAULT_BROWSER_MODEL };

export function useIkigaider({ t = (k) => k, locale = 'en' } = {}) {
  const dbRef = useRef(null);
  const activeIdRef = useRef(null); // current session id, for the persist() closure
  const [ready, setReady] = useState(false);
  const [config, setConfig] = useState(null);
  const [sessions, setSessions] = useState([]);          // session library (metadata)
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [portfolio, setPortfolio] = useState([]);
  const [focalId, setFocalId] = useState(null);
  const [move, setMove] = useState(null);
  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [glide, setGlide] = useState(false);
  const [started, setStarted] = useState(false);
  const [initError, setInitError] = useState(null);
  const [error, setError] = useState(null);
  const [draft, setDraft] = useState('');
  const [sim, setSim] = useState(null);
  const [llmProgress, setLlmProgress] = useState(null);

  // Subscribe to the WebGPU model loader so the UI can show download progress.
  useEffect(() => {
    onLoadProgress((p) => setLlmProgress(p && p.progress < 1 ? p : null));
    return () => onLoadProgress(null);
  }, []);

  // BYO endpoint unreachable -> llm.js retries on the in-browser model; surface a
  // calm, localized note once per conversation (not a red error).
  useEffect(() => {
    onProviderFallback(() => {
      setError(null);
      setMessages((m) => (
        m.some((x) => x.text === t('llm.fallback')) ? m : [...m, { role: 'coach', text: t('llm.fallback') }]
      ));
    });
    return () => onProviderFallback(null);
  }, [t]);

  // --- QUERIES (projections over the active journey) -------------------------
  const refresh = useCallback(() => {
    const list = dbRef.current.listActivities().filter((a) => !a.archived);
    setPortfolio(list);
    return list;
  }, []);

  // Restore focal/move/started from a portfolio (reload, switch, import).
  const hydrate = useCallback((list) => {
    const best = bestActivity(list);
    setFocalId(best?.id ?? null);
    setStarted(list.length > 0);
    setGlide(false);
    setMove(best ? decideMove(list, best.id) : null);
  }, []);

  // --- COMMANDS: persistence ------------------------------------------------
  // Fire-and-forget save of the active journey blob to its session row.
  const persist = useCallback(() => {
    if (dbRef.current && activeIdRef.current) {
      putSession({ id: activeIdRef.current, bytes: dbRef.current.export() });
    }
  }, []);

  // Load a journey blob into the active slot and reset the conversation view.
  // No persist, no session-row write — callers own that ordering (so deleting the
  // active session can switch away WITHOUT re-saving the row we just removed).
  const activate = useCallback(async (id, bytes) => {
    dbRef.current = await initBrowserDb(bytes || undefined);
    activeIdRef.current = id;
    setActiveSessionId(id);
    setMessages([]);
    setSim(null);
    setError(null);
    setDraft('');
    hydrate(refresh());
  }, [refresh, hydrate]);

  // Init: migrate the legacy single journey (+ its config) into the library once,
  // ensure an active session exists, then load it. Runs once on mount.
  useEffect(() => {
    (async () => {
      try {
        const legacy = loadDbBytes();
        if (legacy) {
          const migratedId = await migrateLegacy(legacy, t('session.default'));
          if (migratedId) {
            const tmp = await initBrowserDb(legacy);
            const legacyCfg = tmp.getConfig();
            if (legacyCfg && !loadGlobalConfig()) saveGlobalConfig(legacyCfg);
            clearDbBytes();
          }
        }
        let activeId = await idbGetActiveId();
        if (!activeId) {
          const fresh = await initBrowserDb();
          activeId = await putSession({ name: t('session.default'), bytes: fresh.export() });
          await idbSetActive(activeId);
        }
        await activate(activeId, await idbGetBytes(activeId));
        setSessions(await idbList());
        setConfig(loadGlobalConfig() || DEFAULT_CONFIG);
        setReady(true);
      } catch (e) {
        setInitError(e?.message || String(e));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-once init
  }, []);

  // --- COMMANDS: config (global, not per-session) ---------------------------
  const saveConfig = useCallback((cfg) => {
    saveGlobalConfig(cfg);
    setConfig(cfg);
  }, []);

  // --- COMMANDS: session library --------------------------------------------
  const refreshSessions = useCallback(async () => setSessions(await idbList()), []);

  const newSession = useCallback(async (name) => {
    persist();
    const fresh = await initBrowserDb();
    const id = await putSession({ name: name || t('session.new'), bytes: fresh.export() });
    await idbSetActive(id);
    await activate(id, fresh.export());
    await refreshSessions();
  }, [persist, activate, refreshSessions, t]);

  const switchSession = useCallback(async (id) => {
    if (id === activeIdRef.current) return;
    persist();
    await idbSetActive(id);
    await activate(id, await idbGetBytes(id));
    await refreshSessions();
  }, [persist, activate, refreshSessions]);

  const renameSession = useCallback(async (id, name) => {
    await idbRename(id, name);
    await refreshSessions();
  }, [refreshSessions]);

  const deleteSession = useCallback(async (id) => {
    await idbDelete(id);
    if (id === activeIdRef.current) {
      const rest = await idbList();
      if (rest.length) {
        await idbSetActive(rest[0].id);
        await activate(rest[0].id, await idbGetBytes(rest[0].id)); // no persist of the deleted row
      } else {
        const fresh = await initBrowserDb();
        const nid = await putSession({ name: t('session.new'), bytes: fresh.export() });
        await idbSetActive(nid);
        await activate(nid, fresh.export());
      }
    }
    await refreshSessions();
  }, [activate, refreshSessions, t]);

  // --- COMMANDS: export / restore -------------------------------------------
  const exportDb = useCallback(() => {
    // Sanitized: the downloaded journey never carries config (it's global anyway).
    const blob = new Blob([dbRef.current.exportSanitized()], { type: 'application/octet-stream' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ikigaider-journey-${new Date().toISOString().slice(0, 10)}.sqlite`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, []);

  // Restore a journey blob AS A NEW SESSION (import file / demo). Config stays
  // global — an imported journey's config (if any) is ignored.
  const importBytes = useCallback(async (bytes, { note, name } = {}) => {
    persist();
    const fresh = await initBrowserDb(new Uint8Array(bytes));
    const id = await putSession({ name: name || t('session.imported'), bytes: fresh.export() });
    await idbSetActive(id);
    await activate(id, fresh.export());
    if (note) setMessages([{ role: 'coach', text: note }]);
    await refreshSessions();
  }, [persist, activate, refreshSessions, t]);

  const importDb = useCallback(async (file) => {
    await importBytes(await file.arrayBuffer(), { note: t('coach.imported'), name: t('session.imported') });
  }, [importBytes, t]);

  const loadDemo = useCallback(async () => {
    const res = await fetch(`${import.meta.env.BASE_URL}demo.sqlite`);
    if (!res.ok) throw new Error('demo.sqlite not found');
    await importBytes(await res.arrayBuffer(), { note: t('coach.demoNote'), name: t('session.demo') });
  }, [importBytes, t]);

  // --- COMMANDS: coaching turn ----------------------------------------------
  const say = (role, text, mv) => setMessages((m) => [...m, { role, text, move: mv }]);

  const applyTurn = useCallback((turn) => {
    setPortfolio(turn.portfolio);
    say('coach', turn.message, turn.executedMove);
    setGlide(turn.glide);
    setFocalId(turn.focalId);
    setMove(turn.nextMove);
  }, []);

  const runTurn = useCallback(async (userText, executeMove, prevFocalId) => {
    const turn = await orchRunTurn(dbRef.current, coach, { config, userText, executeMove, prevFocalId, locale });
    applyTurn(turn);
  }, [config, locale, applyTurn]);

  const ingest = useCallback(async (text) => {
    setGlide(false);
    const r = await orchIngest(dbRef.current, { assess, coach }, { config, text, locale });
    if (r.kind === 'placed') applyTurn(r.turn);
    else { setPortfolio(r.portfolio); say('coach', t('coach.interview')); }
  }, [config, locale, applyTurn, t]);

  const start = useCallback(async (text) => {
    setBusy(true); setError(null); setStarted(true); say('user', text);
    try { await ingest(text); }
    catch (e) { setError(`Assessment failed: ${e.message}`); }
    finally { persist(); setBusy(false); }
  }, [ingest, persist]);

  const send = useCallback(async (text) => {
    setBusy(true); setError(null); say('user', text);
    try {
      if (move) await runTurn(text, move, focalId);
      else await ingest(text);
    } catch (e) { setError(`Coach failed: ${e.message}`); }
    finally { persist(); setBusy(false); }
  }, [move, focalId, runTurn, ingest, persist]);

  // --- viz-as-input + simulation --------------------------------------------
  const placeFromMap = useCallback((scores) => setDraft(placementDraft(scores, t)), [t]);
  const simulate = useCallback((scores) => setSim({ scores }), []);
  const clearSim = useCallback(() => setSim(null), []);
  const pickHistory = useCallback((scores) => setSim({ scores }), []);
  const coachToward = useCallback((scores) => { setDraft(placementDraft(scores, t)); setSim(null); }, [t]);

  const focal = portfolio.find((a) => a.id === focalId) || null;
  const trajectory = focalId ? dbRef.current?.scoresFor(focalId).map((s) => s.scores) || [] : [];
  const focalUncertainty = focal ? uncertainty(focal) : 0;

  return {
    ready, initError, error, config, portfolio, focal, focalId, move, messages, busy, glide, started,
    trajectory, focalUncertainty, draft, setDraft, sim, llmProgress,
    sessions, activeSessionId, newSession, switchSession, renameSession, deleteSession,
    saveConfig, exportDb, importDb, loadDemo, start, send, placeFromMap,
    simulate, clearSim, pickHistory, coachToward,
  };
}
