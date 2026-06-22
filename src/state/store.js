// store.js — orchestration. Binds the pure libs (ikigai/policy/llm), the DB,
// and React together. The only module that knows about all of them.

import { useCallback, useEffect, useRef, useState } from 'react';
import { initBrowserDb } from '../db/sqlite-browser.js';
import { saveDbBytes, loadDbBytes } from '../db/persist.js';
import { decideMove, bestActivity, uncertainty } from '../lib/policy.js';
import { assess, coach } from '../lib/llm.js';
import { ingest as orchIngest, runTurn as orchRunTurn } from '../lib/orchestrator.js';
import { onLoadProgress, DEFAULT_BROWSER_MODEL, DEFAULT_BROWSER_BASE } from '../lib/webllm.js';
import { placementDraft } from '../i18n/index.js';

// A fresh user (or an imported journey, whose config was stripped on export)
// defaults to the zero-setup in-browser engine — WebGPU if available, else the
// CPU fallback. No endpoint, no key: send a message and it just coaches.
const DEFAULT_CONFIG = { base_url: DEFAULT_BROWSER_BASE, api_key: '', model: DEFAULT_BROWSER_MODEL };

// `t` and `locale` come from the LocaleProvider; default to identity/en so the
// hook still works in tests or outside a provider.
export function useIkigaider({ t = (k) => k, locale = 'en' } = {}) {
  const dbRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [config, setConfig] = useState(null);
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
  // `sim` = a desired/what-if state the user is simulating (dragging the dot or
  // picking a past state). Pure-math overlay — no LLM until they commit.
  const [sim, setSim] = useState(null);
  // In-browser model download/init progress (null when idle/done).
  const [llmProgress, setLlmProgress] = useState(null);

  // Subscribe to the WebGPU model loader so the UI can show download progress.
  useEffect(() => {
    onLoadProgress((p) => setLlmProgress(p && p.progress < 1 ? p : null));
    return () => onLoadProgress(null);
  }, []);

  const refresh = useCallback(() => {
    const list = dbRef.current.listActivities().filter((a) => !a.archived);
    setPortfolio(list);
    return list;
  }, []);

  // Write the whole DB to the localStorage cache so a reload survives.
  const persist = useCallback(() => {
    if (dbRef.current) saveDbBytes(dbRef.current.export());
  }, []);

  // Restore focal/move/started from a portfolio (used on reload + import).
  const hydrate = useCallback((list) => {
    const best = bestActivity(list);
    setFocalId(best?.id ?? null);
    setStarted(list.length > 0);
    setGlide(false);
    setMove(best ? decideMove(list, best.id) : null);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const cached = loadDbBytes();
        dbRef.current = await initBrowserDb(cached || undefined);
        setConfig(dbRef.current.getConfig() || DEFAULT_CONFIG);
        hydrate(refresh());
        setReady(true);
      } catch (e) {
        setInitError(e?.message || String(e));
      }
    })();
  }, [refresh, hydrate]);

  const saveConfig = useCallback((cfg) => {
    dbRef.current.setConfig(cfg);
    setConfig(cfg);
    persist();
  }, [persist]);

  const exportDb = useCallback(() => {
    // Sanitized: the downloaded journey never carries the API key/endpoint.
    const blob = new Blob([dbRef.current.exportSanitized()], { type: 'application/octet-stream' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    // Explicit, dated name so exports are recognisable and don't overwrite.
    a.download = `ikigaider-journey-${new Date().toISOString().slice(0, 10)}.sqlite`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, []);

  const importBytes = useCallback(async (bytes, note) => {
    dbRef.current = await initBrowserDb(new Uint8Array(bytes));
    setConfig(dbRef.current.getConfig() || DEFAULT_CONFIG);
    hydrate(refresh());
    setMessages([{ role: 'coach', text: note || t('coach.imported') }]);
    persist();
  }, [refresh, hydrate, persist]);

  const importDb = useCallback(async (file) => {
    await importBytes(await file.arrayBuffer());
  }, [importBytes]);

  const loadDemo = useCallback(async () => {
    const res = await fetch(`${import.meta.env.BASE_URL}demo.sqlite`);
    if (!res.ok) throw new Error('demo.sqlite not found');
    await importBytes(await res.arrayBuffer(), t('coach.demoNote'));
  }, [importBytes, t]);

  const say = (role, text, mv) => setMessages((m) => [...m, { role, text, move: mv }]);

  // Push a coach turn's result (from the pure orchestrator) into React state.
  const applyTurn = useCallback((turn) => {
    setPortfolio(turn.portfolio);
    say('coach', turn.message, turn.executedMove);
    setGlide(turn.glide);
    setFocalId(turn.focalId);
    setMove(turn.nextMove);
  }, []);

  // Execute the current move, apply results, decide the next. The product logic
  // lives in orchestrator.runTurn (shared with the skill); the hook only injects
  // coach() and writes the returned delta into React state.
  const runTurn = useCallback(async (userText, executeMove, prevFocalId) => {
    const turn = await orchRunTurn(dbRef.current, coach, {
      config, userText, executeMove, prevFocalId, locale,
    });
    applyTurn(turn);
  }, [config, locale, applyTurn]);

  // Assess free text into activities and either place the best one (+ first
  // coach turn) or, if nothing concrete surfaced, ask for more (interview).
  const ingest = useCallback(async (text) => {
    setGlide(false);
    const r = await orchIngest(dbRef.current, { assess, coach }, { config, text, locale });
    if (r.kind === 'placed') {
      applyTurn(r.turn);
    } else {
      setPortfolio(r.portfolio);
      say('coach', t('coach.interview'));
    }
  }, [config, locale, applyTurn, t]);

  const start = useCallback(async (text) => {
    setBusy(true);
    setError(null);
    setStarted(true);
    say('user', text);
    try {
      await ingest(text);
    } catch (e) {
      setError(`Assessment failed: ${e.message}`);
    } finally {
      persist();
      setBusy(false);
    }
  }, [ingest, persist]);

  const send = useCallback(async (text) => {
    setBusy(true);
    setError(null);
    say('user', text);
    try {
      // If we have a placed activity, run a coach turn; otherwise keep interviewing.
      if (move) await runTurn(text, move, focalId);
      else await ingest(text);
    } catch (e) {
      setError(`Coach failed: ${e.message}`);
    } finally {
      persist();
      setBusy(false);
    }
  }, [move, focalId, runTurn, ingest, persist]);

  // Viz-as-input: a map CLICK seeds the composer (the one true input) with a
  // complete, natural sentence the user can send or edit — no dangling lead-in.
  const placeFromMap = useCallback((scores) => {
    setDraft(placementDraft(scores, t));
  }, [t]);

  // Simulation: dragging the dot (or picking a past state) sets a what-if target.
  // It stays on drop (this is the fix for "drop does nothing"). Committing it
  // ("coach toward this") hands the sentence to the chat — the real input.
  const simulate = useCallback((scores) => setSim({ scores }), []);
  const clearSim = useCallback(() => setSim(null), []);
  const pickHistory = useCallback((scores) => setSim({ scores }), []);
  const coachToward = useCallback((scores) => {
    setDraft(placementDraft(scores, t));
    setSim(null);
  }, [t]);

  const focal = portfolio.find((a) => a.id === focalId) || null;
  const trajectory = focalId ? dbRef.current?.scoresFor(focalId).map((t) => t.scores) || [] : [];
  const focalUncertainty = focal ? uncertainty(focal) : 0;

  return {
    ready, initError, error, config, portfolio, focal, focalId, move, messages, busy, glide, started,
    trajectory, focalUncertainty, draft, setDraft, sim, llmProgress,
    saveConfig, exportDb, importDb, loadDemo, start, send, placeFromMap,
    simulate, clearSim, pickHistory, coachToward,
  };
}
