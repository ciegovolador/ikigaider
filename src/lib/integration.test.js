// integration.test.js — wires the REAL stack end to end: llm.js transport
// (HTTP, with global.fetch stubbed to a canned OpenAI-compatible server) ->
// the prompts/reviews builders -> the orchestrator -> a real sqlite store. This
// is the suite that would have caught the screenshot bug: it proves that typing
// "/reality-check" routes to a REVIEW turn (re-score), not a coach turn.

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import initSqlJs from 'sql.js';
import { createDb } from '../db/sqlite.js';
import { assess, coach, review } from './llm.js';
import { ingest, runReview, runTurn } from './orchestrator.js';
import { parseReviewCommand, getReview } from './reviews.js';
import { AXES, makeScores } from './ikigai.js';

const require = createRequire(import.meta.url);
let SQL;
beforeAll(async () => { SQL = await initSqlJs({ locateFile: () => require.resolve('sql.js/dist/sql-wasm.wasm') }); });

const config = { base_url: 'http://test.local/v1', model: 'm', api_key: '' };

// A canned OpenAI-compatible endpoint: branches on the system prompt exactly like
// scripts/mock-llm.mjs, so the transport + builders + parser are all exercised.
function cannedFetch(_url, opts) {
  const sys = JSON.parse(opts.body).messages[0].content;
  let content;
  if (sys.includes('you may ONLY change')) {
    const axis = (sys.match(/\((love|good|world|paid)\)/) || [])[1] || 'paid';
    const cur = {};
    for (const a of AXES) { const m = sys.match(new RegExp(`${a}\\s+([0-9.]+)`)); cur[a] = m ? Number(m[1]) : 0.5; }
    content = JSON.stringify({ message: 'no evidence, only intentions', scores: { ...cur, [axis]: 0.2 }, conf: makeScores({}) });
  } else if (sys.includes('Decided move:')) {
    content = JSON.stringify({ message: 'charge for one lesson this month', updates: [], created: [] });
  } else {
    content = JSON.stringify({ activities: [{ name: 'chess', scores: { love: 0.6, good: 0.9, world: 0.4, paid: 0.9 }, conf: { love: 0.4, good: 0.9, world: 0.6, paid: 0.3 } }] });
  }
  return Promise.resolve({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content } }] }), text: async () => '' });
}

let originalFetch;
beforeEach(() => { originalFetch = globalThis.fetch; globalThis.fetch = cannedFetch; });
afterEach(() => { globalThis.fetch = originalFetch; });

async function placeChess() {
  const store = createDb(SQL);
  const r = await ingest(store, { assess, coach }, { config, text: 'I play competitive chess', locale: 'en' });
  return { store, r, id: store.listActivities()[0].id };
}

describe('integration: assess + coach place a scored activity over the transport', () => {
  it('a first turn ingests free text into a placed, scored activity', async () => {
    const { store, r } = await placeChess();
    expect(r.kind).toBe('placed');
    expect(store.listActivities()[0].name).toBe('chess');
    expect(store.listActivities()[0].scores.paid).toBeGreaterThan(0.5);
    expect(r.turn.message).toBeTruthy();
  });
});

describe('integration: /reality-check routes to a REVIEW and re-scores (the screenshot bug)', () => {
  it('the direct command parses, runs a review through llm.review, and downgrades paid', async () => {
    const { store, id } = await placeChess();
    const before = store.listActivities()[0].scores.paid;

    const cmd = parseReviewCommand('/reality-check'); // <- used to return null
    expect(cmd).toEqual({ reviewName: 'reality-check', axis: 'paid', panel: null });

    const r = await runReview(store, review, { config, focalId: id, spec: getReview(cmd.reviewName), locale: 'en' });
    expect(r.verdict).toBe('downgrade');
    expect(r.after).toBeLessThan(before);
    expect(store.listActivities()[0].scores.paid).toBeCloseTo(0.2);
    // the conversation only changed the reviewed axis
    expect(store.listActivities()[0].scores.good).toBeCloseTo(0.9);
  });

  it('a direct persona command /plan-craftsman-review re-scores the GOOD axis', async () => {
    const { store, id } = await placeChess();
    const cmd = parseReviewCommand('/plan-craftsman-review');
    expect(cmd.reviewName).toBe('plan-craftsman-review');
    const r = await runReview(store, review, { config, focalId: id, spec: getReview(cmd.reviewName), locale: 'en' });
    expect(r.axis).toBe('good');
    expect(store.listActivities()[0].scores.good).toBeCloseTo(0.2);
    expect(store.listActivities()[0].scores.paid).toBeCloseTo(0.9); // untouched
  });
});

describe('integration: a normal message still coaches, never hijacked as a review', () => {
  it('ordinary text parses to null and runs a coach turn', async () => {
    const { store, id } = await placeChess();
    expect(parseReviewCommand('I charged $50 for a lesson last week')).toBeNull();
    const turn = await runTurn(store, coach, {
      config, userText: 'I charged $50 for a lesson last week',
      executeMove: { mode: 'exploit', submode: 'improve', focusId: id, rationale: 'r' }, prevFocalId: id, locale: 'en',
    });
    expect(turn.message).toBe('charge for one lesson this month');
  });
});
