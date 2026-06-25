// conversation.test.js — multi-turn CONVERSATIONAL suite. Each test scripts a
// real back-and-forth (assess -> coach -> /review -> normal reply ...) and
// asserts the journey evolves correctly turn over turn: routing picks the right
// turn type, re-scores land with source='review', the trajectory grows, and
// ordinary replies still coach. The model is injected per turn (deterministic),
// so these are fast and stable; they mirror what a user actually types.

import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'node:module';
import initSqlJs from 'sql.js';
import { createDb } from '../db/sqlite.js';
import { ingest, runTurn, runReview } from './orchestrator.js';
import { parseReviewCommand, getReview } from './reviews.js';
import { decideMove } from './policy.js';
import { makeScores } from './ikigai.js';

const require = createRequire(import.meta.url);
let SQL;
beforeAll(async () => { SQL = await initSqlJs({ locateFile: () => require.resolve('sql.js/dist/sql-wasm.wasm') }); });

const caller = (payload) => async () => payload;
const reviewSourcedRows = (store) =>
  store.db.exec("SELECT COUNT(*) FROM scores WHERE source = 'review'")[0]?.values[0][0] ?? 0;

// Drive one user turn the way the web controller (store.js send) does: a review
// command routes to runReview; anything else coaches.
async function turn(store, text, { focalId, assessReply, coachReply, reviewReply }) {
  const cmd = parseReviewCommand(text);
  if (cmd && cmd.reviewName) {
    return { kind: 'review', r: await runReview(store, caller(reviewReply), { config: {}, focalId, spec: getReview(cmd.reviewName), locale: 'en' }) };
  }
  if (cmd && cmd.panel) return { kind: 'panel', panel: cmd.panel };
  const portfolio = store.listActivities().filter((a) => !a.archived);
  if (!portfolio.length) {
    return { kind: 'ingest', r: await ingest(store, { assess: caller(assessReply), coach: caller(coachReply) }, { config: {}, text, locale: 'en' }) };
  }
  return { kind: 'coach', r: await runTurn(store, caller(coachReply), { config: {}, userText: text, executeMove: decideMove(portfolio, focalId), prevFocalId: focalId, locale: 'en' }) };
}

describe('conversation: the chess player reality-checks two axes', () => {
  it('assess -> /reality-check (paid down) -> /review love (love down), journey accretes review rows', async () => {
    const store = createDb(SQL);

    // Turn 1: the person describes themselves -> a placed, scored activity.
    const t1 = await turn(store, "I'm a competitive chess player", {
      assessReply: { activities: [{ name: 'competitive chess', scores: { love: 0.6, good: 0.9, world: 0.4, paid: 0.9 }, conf: { love: 0.4, good: 0.9, world: 0.6, paid: 0.3 } }] },
      coachReply: { message: 'Chess is Profession-leaning.', updates: [], created: [] },
    });
    expect(t1.kind).toBe('ingest');
    expect(t1.r.kind).toBe('placed');
    const id = store.listActivities()[0].id;
    expect(store.listActivities()[0].scores.paid).toBeCloseTo(0.9);

    // Turn 2: the user types the command from the screenshot.
    const t2 = await turn(store, '/reality-check', {
      focalId: id,
      reviewReply: { message: 'You named no real income — only that it could pay. Paid drops.', scores: { love: 0.6, good: 0.9, world: 0.4, paid: 0.15 }, conf: makeScores({ paid: 0.85 }) },
    });
    expect(t2.kind).toBe('review');
    expect(t2.r.verdict).toBe('downgrade');
    expect(store.listActivities()[0].scores.paid).toBeCloseTo(0.15);
    expect(store.listActivities()[0].scores.good).toBeCloseTo(0.9); // carried
    expect(reviewSourcedRows(store)).toBe(1);

    // Turn 3: a different axis via /review love -> the psychologist seat.
    const t3 = await turn(store, '/review love', {
      focalId: id,
      reviewReply: { message: 'You described obligation, not a day you lost track of time. Love drops.', scores: { love: 0.3, good: 0.9, world: 0.4, paid: 0.15 }, conf: makeScores({ love: 0.8 }) },
    });
    expect(t3.kind).toBe('review');
    expect(t3.r.axis).toBe('love');
    expect(store.listActivities()[0].scores.love).toBeCloseTo(0.3);

    // The journey now records both evidence-driven re-scores.
    expect(reviewSourcedRows(store)).toBe(2);
    expect(store.scoresFor(id).length).toBe(3); // assess + 2 reviews
  });
});

describe('conversation: ordinary replies between reviews still coach (routing regression)', () => {
  it('a normal sentence after a review runs a coach turn, not a review', async () => {
    const store = createDb(SQL);
    await turn(store, 'I tutor maths', {
      assessReply: { activities: [{ name: 'tutoring', scores: { love: 0.7, good: 0.7, world: 0.7, paid: 0.5 }, conf: makeScores({}) }] },
      coachReply: { message: 'placed', updates: [], created: [] },
    });
    const id = store.listActivities()[0].id;

    const t = await turn(store, 'I raised my rate to $40 and kept all my students', {
      focalId: id,
      coachReply: { message: 'Good — that lifts the paid axis.', updates: [{ name: 'tutoring', scores: { love: 0.7, good: 0.7, world: 0.7, paid: 0.7 }, conf: makeScores({}) }], created: [] },
    });
    expect(t.kind).toBe('coach');
    expect(store.listActivities()[0].scores.paid).toBeCloseTo(0.7);
    expect(reviewSourcedRows(store)).toBe(0); // nothing was logged as a review
  });
});

describe('conversation: panels and empty-journey guards', () => {
  it('/panel routes to a panel, not a review or coach', async () => {
    const store = createDb(SQL);
    const t = await turn(store, '/panel', {});
    expect(t.kind).toBe('panel');
    expect(t.panel).toBe('panel');
  });

  it('a review before any activity exists surfaces a clear error (no partial write)', async () => {
    const store = createDb(SQL);
    await expect(
      turn(store, '/reality-check', { focalId: null, reviewReply: { message: 'x', scores: makeScores({}), conf: makeScores({}) } }),
    ).rejects.toThrow(/existing activity/);
    expect(reviewSourcedRows(store)).toBe(0);
  });
});
