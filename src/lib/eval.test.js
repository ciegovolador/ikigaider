// eval.test.js — deterministic QUALITY GATE (Tier-1 eval). Runs golden cases
// through the REAL pipeline (orchestrator + reviews/prompts builders + ikigai
// math) with the model injected, and asserts invariants that must hold no matter
// what the model returns. This is the suite that catches the screenshot class of
// bug: scores out of range, an axis silently dropped, or a VERDICT that
// contradicts the numbers ("downgrade" while the score went up).
//
// It cannot make a small model smart (that's the separate Tier-2 LLM-judge run),
// but it locks that OUR handling of any model reply stays valid + self-consistent.

import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'node:module';
import initSqlJs from 'sql.js';
import { createDb } from '../db/sqlite.js';
import { applyPayload, runTurn, runReview } from './orchestrator.js';
import { REVIEWS, getReview } from './reviews.js';
import { AXES, makeScores, ikigaiScore } from './ikigai.js';

const require = createRequire(import.meta.url);
let SQL;
beforeAll(async () => { SQL = await initSqlJs({ locateFile: () => require.resolve('sql.js/dist/sql-wasm.wasm') }); });

const inRange = (s) => AXES.every((a) => s[a] >= 0 && s[a] <= 1);
const caller = (payload) => async () => payload;
const seed = (scores) => {
  const store = createDb(SQL);
  applyPayload(store, { activities: [{ name: 'thing', scores: makeScores(scores), conf: makeScores({}) }] });
  return { store, id: store.listActivities()[0].id };
};

describe('eval: review invariants hold for EVERY reviewer (Liskov golden set)', () => {
  for (const name of Object.keys(REVIEWS)) {
    const spec = getReview(name);
    it(`${name} (axis ${spec.axis}): changes only its axis, stays in range, verdict matches the delta`, async () => {
      const before = { love: 0.8, good: 0.8, world: 0.8, paid: 0.8 };
      const { store, id } = seed(before);
      // Model proposes lowering its axis to 0.2 and (illegally) slashing the rest.
      const modelScores = { love: 0.05, good: 0.05, world: 0.05, paid: 0.05 };
      modelScores[spec.axis] = 0.2;
      const r = await runReview(store, caller({ message: 'no evidence', scores: modelScores, conf: makeScores({}) }), {
        config: {}, focalId: id, spec, locale: 'en',
      });
      const after = store.listActivities()[0].scores;
      expect(inRange(after), 'scores in [0,1]').toBe(true);
      for (const a of AXES) {
        if (a === spec.axis) expect(after[a]).toBeCloseTo(0.2);
        else expect(after[a], `${a} carried forward`).toBeCloseTo(before[a]); // others untouched
      }
      // Verdict can NEVER contradict the numbers (the "0.6 > 0.9" guard).
      expect(r.verdict).toBe('downgrade');
      expect(r.after).toBeLessThan(r.before);
    });
  }
});

describe('eval: verdict label is always consistent with the numeric delta', () => {
  const spec = getReview('reality-check'); // paid
  const cases = [
    { proposed: 0.2, before: 0.8, verdict: 'downgrade', cmp: (a, b) => a < b },
    { proposed: 0.95, before: 0.5, verdict: 'upgrade', cmp: (a, b) => a > b },
    { proposed: 0.5, before: 0.5, verdict: 'unchanged', cmp: (a, b) => Math.abs(a - b) < 0.02 },
  ];
  for (const c of cases) {
    it(`paid ${c.before} -> ${c.proposed} reports ${c.verdict}`, async () => {
      const { store, id } = seed({ paid: c.before });
      const r = await runReview(store, caller({ message: 'm', scores: makeScores({ paid: c.proposed }), conf: makeScores({}) }), {
        config: {}, focalId: id, spec, locale: 'en',
      });
      expect(r.verdict).toBe(c.verdict);
      expect(c.cmp(r.after, r.before)).toBe(true);
    });
  }
});

describe('eval: malformed model replies are made safe, never propagated', () => {
  const spec = getReview('reality-check');
  it('clamps an out-of-range axis to [0,1]', async () => {
    const { store, id } = seed({ paid: 0.5 });
    const r = await runReview(store, caller({ message: 'm', scores: { love: 0.5, good: 0.5, world: 0.5, paid: 9 }, conf: makeScores({}) }), {
      config: {}, focalId: id, spec, locale: 'en',
    });
    expect(r.after).toBe(1); // clamped, not 9
    expect(inRange(store.listActivities()[0].scores)).toBe(true);
  });
  it('an omitted reviewed axis leaves the score unchanged (no zeroing)', async () => {
    const { store, id } = seed({ paid: 0.7 });
    const r = await runReview(store, caller({ message: 'm', scores: { love: 0.5, good: 0.5, world: 0.5 }, conf: {} }), {
      config: {}, focalId: id, spec, locale: 'en',
    });
    expect(r.after).toBeCloseTo(0.7);
  });
});

describe('eval: a coach turn never stores an out-of-range score', () => {
  it('clamps whatever the model returns via makeScores', async () => {
    const { store, id } = seed({ love: 0.5, good: 0.5, world: 0.5, paid: 0.5 });
    const coach = caller({ message: 'go', updates: [{ name: 'thing', scores: { love: 5, good: -2, world: 0.5, paid: 0.5 }, conf: makeScores({}) }], created: [] });
    await runTurn(store, coach, { config: {}, userText: '', executeMove: { mode: 'exploit', submode: 'improve', focusId: id, rationale: 'r' }, prevFocalId: id, locale: 'en' });
    const s = store.listActivities()[0].scores;
    expect(inRange(s)).toBe(true);
    expect(ikigaiScore(s)).toBeGreaterThanOrEqual(0);
    expect(ikigaiScore(s)).toBeLessThanOrEqual(1);
  });
});
