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
import { decideMove, bestActivity, uncertainty, reviewNudge } from '../lib/policy.js';
import { assess, coach, review, onProviderFallback } from '../lib/llm.js';
import { ingest as orchIngest, runTurn as orchRunTurn, runReview as orchRunReview } from '../lib/orchestrator.js';
import { parseReviewCommand, getReview, getPanel, listCommands } from '../lib/reviews.js';

// The slash-command catalog is static — compute once for the composer dropdown.
const COMMANDS = listCommands();
import { summarizeJourney } from '../lib/digest.js';
import { onLoadProgress, DEFAULT_BROWSER_MODEL, DEFAULT_BROWSER_BASE } from '../lib/webllm.js';
import { placementDraft } from '../i18n/index.js';

// A fresh user defaults to the zero-setup in-browser engine — WebGPU if available,
// else the CPU fallback. No endpoint, no key: send a message and it just coaches.
const DEFAULT_CONFIG = { base_url: DEFAULT_BROWSER_BASE, api_key: '', model: DEFAULT_BROWSER_MODEL };

export function useIkigaider({ t = (k) => k, locale = 'en' } = {}) {
  const dbRef = useRef(null);
  const activeIdRef = useRef(null); // current session id, for the persist() closure
  // Summary the user mixed in from other sessions — rides into the coach prompt as
  // context (not re-scored). Belongs to the active session; cleared on switch/new.
  const mixedContextRef = useRef('');
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
  // Save the active journey blob to its session row. Captures id + bytes
  // SYNCHRONOUSLY (so a later switch/delete can't change what we're saving), and
  // exposes the in-flight promise via persistRef. Session commands DRAIN that
  // promise before mutating the library — otherwise a just-finished turn's save
  // (putSession does a read-then-write) can race a delete and resurrect the row.
  const persistRef = useRef(Promise.resolve());
  const persist = useCallback(() => {
    const id = activeIdRef.current;
    const bytes = dbRef.current?.export();
    if (!id || !bytes) return Promise.resolve();
    persistRef.current = putSession({ id, bytes }).catch(() => {});
    return persistRef.current;
  }, []);

  // Load a journey blob into the active slot and reset the conversation view.
  // No persist, no session-row write — callers own that ordering (so deleting the
  // active session can switch away WITHOUT re-saving the row we just removed).
  const activate = useCallback(async (id, bytes) => {
    dbRef.current = await initBrowserDb(bytes || undefined);
    activeIdRef.current = id;
    setActiveSessionId(id);
    // Restore the conversation: visible turns render; hidden '_context' rows (mixed-
    // in digests) reload into the coach context, not the thread.
    const all = dbRef.current.listMessages();
    mixedContextRef.current = all.filter((m) => m.role === '_context').map((m) => m.text).join('\n');
    setMessages(all.filter((m) => m.role !== '_context'));
    setSim(null);
    setError(null);
    setDraft('');
    hydrate(refresh());
  }, [refresh, hydrate]);

  // Init: migrate the legacy single journey (+ its config) into the library once,
  // ensure an active session exists, then load it. The ref guard makes this run
  // exactly once — React 18 StrictMode double-invokes effects in dev, and
  // "ensure a session exists" must not create two.
  const initedRef = useRef(false);
  useEffect(() => {
    if (initedRef.current) return;
    initedRef.current = true;
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
    await persist();
    const fresh = await initBrowserDb();
    const id = await putSession({ name: name || t('session.new'), bytes: fresh.export() });
    await idbSetActive(id);
    await activate(id, fresh.export());
    await refreshSessions();
  }, [persist, activate, refreshSessions, t]);

  const switchSession = useCallback(async (id) => {
    if (id === activeIdRef.current) return;
    await persist(); // finish saving the current session before loading another
    await idbSetActive(id);
    await activate(id, await idbGetBytes(id));
    await refreshSessions();
  }, [persist, activate, refreshSessions]);

  const renameSession = useCallback(async (id, name) => {
    await idbRename(id, name);
    await refreshSessions();
  }, [refreshSessions]);

  const deleteSession = useCallback(async (id) => {
    await persistRef.current; // let any in-flight save settle, then delete for good
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
    await persist();
    const fresh = await initBrowserDb(new Uint8Array(bytes));
    const id = await putSession({ name: name || t('session.imported'), bytes: fresh.export() });
    await idbSetActive(id);
    await activate(id, fresh.export());
    if (note) say('coach', note); // persists into the new session
    persist();
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
  // Append a message to the thread AND persist it to the active journey, so the
  // conversation is restored when the session is reopened (the journey blob, saved
  // to IndexedDB by persist(), carries the messages table).
  const say = (role, text, mv) => {
    setMessages((m) => [...m, { role, text, move: mv }]);
    dbRef.current?.addMessage(role, text, mv ?? null);
  };

  const applyTurn = useCallback((turn) => {
    setPortfolio(turn.portfolio);
    say('coach', turn.message, turn.executedMove);
    // Discoverability for /review: if an axis is high-but-unproven, nudge (no auto-run).
    const nudge = reviewNudge(turn.portfolio);
    if (nudge) say('coach', nudge);
    setGlide(turn.glide);
    setFocalId(turn.focalId);
    setMove(turn.nextMove);
  }, []);

  const runTurn = useCallback(async (userText, executeMove, prevFocalId) => {
    const turn = await orchRunTurn(dbRef.current, coach, {
      config, userText, executeMove, prevFocalId, locale, context: mixedContextRef.current || undefined,
    });
    applyTurn(turn);
  }, [config, locale, applyTurn]);

  const ingest = useCallback(async (text) => {
    setGlide(false);
    const r = await orchIngest(dbRef.current, { assess, coach }, {
      config, text, locale, context: mixedContextRef.current || undefined,
    });
    if (r.kind === 'placed') applyTurn(r.turn);
    else { setPortfolio(r.portfolio); say('coach', t('coach.interview')); }
  }, [config, locale, applyTurn, t]);

  // Mix = bring another session's CONTEXT (a digest) into the active one. We do
  // NOT copy its activities onto the map; the summary rides into the next coach
  // turn as background. `source` is a session id (from the list) or a File.
  const mixInto = useCallback(async (source) => {
    let bytes;
    let name;
    if (typeof source === 'string') {
      bytes = await idbGetBytes(source);
      name = sessions.find((s) => s.id === source)?.name || t('session.untitled');
    } else {
      bytes = new Uint8Array(await source.arrayBuffer());
      name = source.name || t('session.imported');
    }
    if (!bytes) return;
    const src = await initBrowserDb(bytes);
    const digest = summarizeJourney(src.listActivities().filter((a) => !a.archived));
    if (!digest) { say('coach', t('mix.empty', { name })); return; }
    mixedContextRef.current = mixedContextRef.current ? `${mixedContextRef.current}\n${digest}` : digest;
    dbRef.current.addMessage('_context', digest); // persist the digest (hidden row)
    say('coach', t('mix.summary', { name }));     // visible confirmation
    persist();
  }, [sessions, t, persist]);

  const start = useCallback(async (text) => {
    setBusy(true); setError(null); setStarted(true); say('user', text);
    try { await ingest(text); }
    catch (e) { setError(`Assessment failed: ${e.message}`); }
    finally { persist(); setBusy(false); }
  }, [ingest, persist]);

  // A review is a forcing-questions turn that re-scores ONE axis (source='review').
  // Same pure orchestrator the skill runs, with llm.js injected as the model.
  const runReviewTurn = useCallback(async (reviewName) => {
    const spec = getReview(reviewName);
    const r = await orchRunReview(dbRef.current, review, { config, focalId, spec, locale });
    setPortfolio(r.portfolio);
    say('coach', r.message);
    setFocalId(r.focalId);
    setMove(decideMove(r.portfolio, r.focalId));
  }, [config, focalId, locale]);

  const send = useCallback(async (text) => {
    // "/review <axis>" in the existing composer starts a review (no new view); any
    // other text routes to the normal coach/assess path (the regression guard).
    const cmd = parseReviewCommand(text);
    setBusy(true); setError(null); say('user', text);
    try {
      if (cmd) {
        if (cmd.panel) {
          const p = getPanel(cmd.panel);
          say('coach', t('review.panel', { title: p.title, members: p.members.map((m) => `/${m}`).join('  ') }));
        } else if (!cmd.reviewName) say('coach', t('review.unknown', { axis: cmd.axis || '?' }));
        else if (!focalId) say('coach', t('review.noFocal'));
        else await runReviewTurn(cmd.reviewName);
      } else if (text.trim().startsWith('/')) {
        // An unrecognized slash command must NOT silently become a coach turn (that
        // produced the "/mentor -> Congratulations" hallucination). Surface it.
        say('coach', t('review.unknownCmd', { cmd: text.trim().split(/\s+/)[0] }));
      } else if (move) await runTurn(text, move, focalId);
      else await ingest(text);
    } catch (e) { setError(`Coach failed: ${e.message}`); }
    finally { persist(); setBusy(false); }
  }, [move, focalId, runTurn, ingest, persist, runReviewTurn, t]);

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
    trajectory, focalUncertainty, draft, setDraft, sim, llmProgress, commands: COMMANDS,
    sessions, activeSessionId, newSession, switchSession, renameSession, deleteSession, mixInto,
    saveConfig, exportDb, importDb, loadDemo, start, send, placeFromMap,
    simulate, clearSim, pickHistory, coachToward,
  };
}
