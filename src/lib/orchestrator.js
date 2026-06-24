// orchestrator.js — the product logic, pure of any front door. Turns an
// assess/coach payload into DB writes and the next move. No React, no transport:
// it takes an IkigaiStore instance and an INJECTED model-caller (assess/coach),
// does the writes, and RETURNS the resulting state for the caller to render.
//
// This is the seam that makes "three doors, one product" true:
//   web   -> useIkigaider injects llm.js assess/coach (HTTP / WebLLM)
//   skill -> cli.mjs injects callers that read the harness agent's JSON
// Same orchestration either way; only the injected caller differs.
//
//   applyPayload(store, payload)            -> [createdIds]  (dedup by name)
//   runTurn(store, coach, args)             -> { message, focalId, nextMove, ... }
//   ingest(store, {assess, coach}, args)    -> { kind:'placed', turn } | { kind:'interview', portfolio }

import { makeScores } from './ikigai.js';
import { decideMove, bestActivity } from './policy.js';

const active = (store) => store.listActivities().filter((a) => !a.archived);

export const findByName = (portfolio, name) =>
  portfolio.find((a) => a.name.toLowerCase() === String(name).toLowerCase());

// Apply an assess/coach payload to the store; return ids of NEW activities.
// Dedup: an update, or a created/assessed activity whose name already exists,
// routes to addScore — never a duplicate row. The name map is seeded from the
// store and updated as we create, so duplicates WITHIN one payload also dedup.
// (Fixes the repeated-invocation accretion the single-shot web flow never hit.)
export function applyPayload(store, payload) {
  const created = [];
  const byName = new Map(store.listActivities().map((a) => [a.name.toLowerCase(), a.id]));

  for (const u of payload.updates || []) {
    const id = byName.get(String(u.name).toLowerCase());
    if (id) store.addScore(id, makeScores(u.scores), u.conf || {}, 'coach');
  }
  for (const c of [...(payload.activities || []), ...(payload.created || [])]) {
    const key = String(c.name).toLowerCase();
    const existingId = byName.get(key);
    if (existingId) {
      store.addScore(existingId, makeScores(c.scores), c.conf || {}, 'assess');
    } else {
      const id = store.addActivity(c.name);
      store.addScore(id, makeScores(c.scores), c.conf || {}, 'assess');
      byName.set(key, id);
      created.push(id);
    }
  }
  return created;
}

// Execute the decided move via the injected coach(), apply results, decide next.
// Pure: returns the state delta; the caller writes it to React (or stdout).
export async function runTurn(store, coach, { config, userText, executeMove, prevFocalId, locale, context }) {
  const focal = store.listActivities().find((a) => a.id === prevFocalId) || null;
  const payload = await coach(config, { move: executeMove, focal, portfolio: active(store), userText, locale, context });
  const createdIds = applyPayload(store, payload);
  const list = active(store);

  // Focal after executing the move: an explore that created an activity teleports.
  let newFocal = prevFocalId;
  if (executeMove.mode === 'explore' && createdIds.length) newFocal = createdIds[0];
  else if (executeMove.focusId) newFocal = executeMove.focusId;

  return {
    message: payload.message || '(no message)',
    executedMove: executeMove,
    createdIds,
    focalId: newFocal,
    nextMove: decideMove(list, newFocal),
    glide: newFocal === prevFocalId,
    portfolio: list,
  };
}

// Assess free text into activities, then either place the best one (running a
// first coach turn) or, if nothing concrete surfaced, signal an interview.
export async function ingest(store, { assess, coach }, { config, text, locale, context }) {
  const payload = await assess(config, text);
  applyPayload(store, payload);
  const list = active(store);
  const best = bestActivity(list);
  if (best) {
    const turn = await runTurn(store, coach, {
      config, userText: '', executeMove: decideMove(list, best.id), prevFocalId: best.id, locale, context,
    });
    return { kind: 'placed', turn };
  }
  return { kind: 'interview', portfolio: list };
}
