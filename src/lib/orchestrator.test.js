import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'node:module';
import initSqlJs from 'sql.js';
import { createDb } from '../db/sqlite.js';
import { applyPayload, runTurn, ingest, runReview } from './orchestrator.js';

const require = createRequire(import.meta.url);
let SQL;
beforeAll(async () => {
  SQL = await initSqlJs({ locateFile: () => require.resolve('sql.js/dist/sql-wasm.wasm') });
});

const SC = (p = {}) => ({ love: 0.5, good: 0.5, world: 0.5, paid: 0.5, ...p });
const act = (name, scores = {}) => ({ name, scores: SC(scores), conf: SC() });
const caller = (payload) => async () => payload;

describe('applyPayload — dedup by name (outside-voice fix)', () => {
  it('collapses duplicate names within one payload to a single activity', () => {
    const store = createDb(SQL);
    const created = applyPayload(store, { created: [act('music'), act('Music', { love: 0.9 })] });
    expect(created).toHaveLength(1);
    expect(store.listActivities()).toHaveLength(1);
    expect(store.scoresFor(created[0])).toHaveLength(2); // one activity, two scores
  });
  it('routes a created name that already exists to a score, not a new row', () => {
    const store = createDb(SQL);
    applyPayload(store, { activities: [act('piano')] });
    applyPayload(store, { created: [act('piano', { love: 0.8 })] });
    expect(store.listActivities()).toHaveLength(1);
  });
  it('applies updates by name without creating a row', () => {
    const store = createDb(SQL);
    applyPayload(store, { activities: [act('piano')] });
    applyPayload(store, { updates: [act('piano', { love: 0.9 })] });
    expect(store.listActivities()).toHaveLength(1);
    expect(store.listActivities()[0].scores.love).toBeCloseTo(0.9);
  });
});

describe('runTurn', () => {
  const seed = () => {
    const store = createDb(SQL);
    applyPayload(store, { activities: [act('job', { love: 0.2, good: 0.8, world: 0.6, paid: 0.9 })] });
    return { store, focalId: store.listActivities()[0].id };
  };

  it('teleports to a newly created activity on an explore move', async () => {
    const { store, focalId } = seed();
    const coach = caller({ message: 'try this', updates: [], created: [act('new thing', { love: 0.9 })] });
    const turn = await runTurn(store, coach, {
      config: {}, userText: '', executeMove: { mode: 'explore', submode: 'jump', rationale: 'r' }, prevFocalId: focalId, locale: 'en',
    });
    expect(turn.createdIds).toHaveLength(1);
    expect(turn.focalId).toBe(turn.createdIds[0]);
    expect(turn.glide).toBe(false);
    expect(turn.nextMove).toBeTruthy();
  });

  it('glides (keeps focal) on an exploit-improve of the same activity', async () => {
    const { store, focalId } = seed();
    const coach = caller({ message: 'keep going', updates: [], created: [] });
    const turn = await runTurn(store, coach, {
      config: {}, userText: 'charging now', executeMove: { mode: 'exploit', submode: 'improve', focusId: focalId, rationale: 'r' }, prevFocalId: focalId, locale: 'en',
    });
    expect(turn.focalId).toBe(focalId);
    expect(turn.glide).toBe(true);
  });

  it('defaults a missing coach message', async () => {
    const { store, focalId } = seed();
    const turn = await runTurn(store, caller({ updates: [], created: [] }), {
      config: {}, userText: '', executeMove: { mode: 'exploit', submode: 'keep', focusId: focalId, rationale: 'r' }, prevFocalId: focalId, locale: 'en',
    });
    expect(turn.message).toBe('(no message)');
  });
});

describe('runReview — single-axis re-score, carry-forward, source=review', () => {
  const SC4 = (p = {}) => ({ love: 0.9, good: 0.7, world: 0.3, paid: 0.8, ...p });
  const spec = { axis: 'paid', name: 'reality-check' };
  const seed = () => {
    const store = createDb(SQL);
    applyPayload(store, { activities: [{ name: 'synth', scores: SC4(), conf: SC() }] });
    return { store, focalId: store.listActivities()[0].id };
  };

  it('downgrades ONLY the reviewed axis; carries the other three forward; tags source=review', async () => {
    const { store, focalId } = seed();
    // The model tries to slash every axis; runReview must change ONLY paid.
    const reviewer = caller({ message: 'no receipts', scores: { love: 0.1, good: 0.1, world: 0.1, paid: 0.3 }, conf: SC({ paid: 0.9 }) });
    const r = await runReview(store, reviewer, { config: {}, focalId, spec, locale: 'en' });
    expect(r.verdict).toBe('downgrade');
    expect(r.before).toBeCloseTo(0.8);
    expect(r.after).toBeCloseTo(0.3);
    const latest = store.listActivities()[0].scores;
    expect(latest.paid).toBeCloseTo(0.3); // reviewed axis moved
    expect(latest.love).toBeCloseTo(0.9); // carried forward, NOT 0.1
    expect(latest.good).toBeCloseTo(0.7);
    expect(latest.world).toBeCloseTo(0.3);
    const reviewRows = store.db.exec("SELECT COUNT(*) FROM scores WHERE source = 'review'")[0].values[0][0];
    expect(reviewRows).toBe(1);
  });

  it('omitted axis number leaves the score unchanged (no zeroing)', async () => {
    const { store, focalId } = seed();
    const r = await runReview(store, caller({ message: 'meh', scores: { love: 0.9, good: 0.7, world: 0.3 }, conf: {} }), { config: {}, focalId, spec, locale: 'en' });
    expect(r.after).toBeCloseTo(0.8); // paid carried forward, not 0
    expect(store.listActivities()[0].scores.paid).toBeCloseTo(0.8);
  });

  it('reports unchanged when the axis holds, and defaults a missing message', async () => {
    const { store, focalId } = seed();
    const r = await runReview(store, caller({ scores: SC4(), conf: SC() }), { config: {}, focalId, spec, locale: 'en' });
    expect(r.verdict).toBe('unchanged');
    expect(r.message).toBe('(no verdict)');
  });

  it('throws a clear error when the focal activity does not exist', async () => {
    const { store } = seed();
    await expect(runReview(store, caller({}), { config: {}, focalId: 'nope', spec, locale: 'en' }))
      .rejects.toThrow(/existing activity/);
  });
});

describe('ingest', () => {
  it('places the best activity and runs a first coach turn', async () => {
    const store = createDb(SQL);
    const assess = caller({ activities: [act('piano', { love: 0.8, good: 0.7, world: 0.6, paid: 0.5 })] });
    const coach = caller({ message: 'go', updates: [], created: [] });
    const r = await ingest(store, { assess, coach }, { config: {}, text: 'I play piano', locale: 'en' });
    expect(r.kind).toBe('placed');
    expect(r.turn.focalId).toBeTruthy();
    expect(r.turn.nextMove).toBeTruthy();
    expect(store.listActivities()).toHaveLength(1);
  });

  it('falls back to interview when assess finds no concrete activity', async () => {
    const store = createDb(SQL);
    const r = await ingest(store, { assess: caller({ activities: [] }), coach: caller({}) }, { config: {}, text: 'hmm', locale: 'en' });
    expect(r.kind).toBe('interview');
    expect(r.portfolio).toEqual([]);
  });
});
