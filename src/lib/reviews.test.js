import { describe, it, expect } from 'vitest';
import {
  REVIEWS, PANELS, REVIEW_SCHEMA, parseReviewCommand, getReview, getPanel, buildReviewMessages, reviewUpdates,
} from './reviews.js';
import { validatePayload } from './prompts.js';
import { makeScores, AXES } from './ikigai.js';

const focal = { id: 'a1', name: 'synth patches', scores: makeScores({ love: 0.9, good: 0.7, world: 0.3, paid: 0.8 }), conf: makeScores({ paid: 0.4 }) };

describe('parseReviewCommand — must never hijack normal text (regression)', () => {
  it('returns null for ordinary text and unknown slash commands', () => {
    expect(parseReviewCommand('I want to review my career')).toBeNull();
    expect(parseReviewCommand('please review this')).toBeNull();
    expect(parseReviewCommand('hello world')).toBeNull();
    expect(parseReviewCommand('/reviewing')).toBeNull();
    expect(parseReviewCommand('/foo')).toBeNull(); // unknown slash -> coach, not "unknown review"
    expect(parseReviewCommand('')).toBeNull();
    expect(parseReviewCommand(null)).toBeNull();
  });
  it('runs a review by DIRECT /<name> command (the form from the screenshot bug)', () => {
    expect(parseReviewCommand('/reality-check')).toEqual({ reviewName: 'reality-check', axis: 'paid', panel: null });
    expect(parseReviewCommand('/plan-economist-review')).toEqual({ reviewName: 'plan-economist-review', axis: 'paid', panel: null });
    expect(parseReviewCommand('  /Reality-Check  ')).toEqual({ reviewName: 'reality-check', axis: 'paid', panel: null });
  });
  it('maps /review <axis> to the board specialist (case-insensitive, trimmed)', () => {
    expect(parseReviewCommand('/review paid')).toEqual({ reviewName: 'plan-economist-review', axis: 'paid', panel: null });
    expect(parseReviewCommand('  /REVIEW PAID  ')).toEqual({ reviewName: 'plan-economist-review', axis: 'paid', panel: null });
    expect(parseReviewCommand('/review love')).toEqual({ reviewName: 'plan-psychologist-review', axis: 'love', panel: null });
    expect(parseReviewCommand('/review good')).toEqual({ reviewName: 'plan-craftsman-review', axis: 'good', panel: null });
    expect(parseReviewCommand('/review world')).toEqual({ reviewName: 'plan-anthropologist-review', axis: 'world', panel: null });
  });
  it('accepts a review by exact name via /review <name>', () => {
    expect(parseReviewCommand('/review reality-check')).toEqual({ reviewName: 'reality-check', axis: 'paid', panel: null });
    expect(parseReviewCommand('/review plan-craftsman-review')).toEqual({ reviewName: 'plan-craftsman-review', axis: 'good', panel: null });
  });
  it('recognizes panels (direct and explicit)', () => {
    expect(parseReviewCommand('/panel')).toEqual({ reviewName: null, axis: '', panel: 'panel' });
    expect(parseReviewCommand('/plan-mentor-review')).toEqual({ reviewName: null, axis: '', panel: 'plan-mentor-review' });
    expect(parseReviewCommand('/review panel')).toEqual({ reviewName: null, axis: '', panel: 'panel' });
  });
  it('returns reviewName null for an unknown axis or a bare /review', () => {
    expect(parseReviewCommand('/review nonsense')).toEqual({ reviewName: null, axis: '', panel: null });
    expect(parseReviewCommand('/review')).toEqual({ reviewName: null, axis: '', panel: null });
  });
});

describe('registry — the board (one discipline per axis) + gstack mirrors', () => {
  const expected = {
    'reality-check': { axis: 'paid', mirrors: 'gstack/qa' },
    'plan-economist-review': { axis: 'paid', mirrors: 'gstack/plan-eng-review' },
    'plan-craftsman-review': { axis: 'good', mirrors: 'gstack/plan-eng-review' },
    'plan-psychologist-review': { axis: 'love', mirrors: 'gstack/plan-design-review' },
    'plan-anthropologist-review': { axis: 'world', mirrors: 'gstack/plan-devex-review' },
  };
  it('every reviewer is a well-formed spec: axis + mirror + version + questions (Liskov)', () => {
    for (const [name, e] of Object.entries(expected)) {
      const r = getReview(name);
      expect(r, name).toBeTruthy();
      expect(r.axis).toBe(e.axis);
      expect(r.mirrors).toBe(e.mirrors);
      expect(r.gstackVersion).toBe('1.51.0.0');
      expect(r.questions.length).toBeGreaterThan(0);
      expect(typeof r.voice).toBe('string');
    }
  });
  it('every ikigai axis has a board specialist', () => {
    const owned = new Set(Object.values(REVIEWS).map((r) => r.axis));
    for (const ax of AXES) expect(owned.has(ax), ax).toBe(true);
  });
  it('panels convene real specialists and mirror gstack chairs', () => {
    expect(getPanel('panel').members.length).toBe(4);
    expect(getPanel('plan-mentor-review').mirrors).toBe('gstack/mentor-review');
    expect(getPanel('plan-strategist-review').mirrors).toBe('gstack/plan-ceo-review');
    for (const p of Object.values(PANELS)) for (const m of p.members) expect(getReview(m), m).toBeTruthy();
  });
  it('getReview returns null for an unknown name', () => {
    expect(getReview('nope')).toBeNull();
  });
});

describe('reviewUpdates — free-updates drift check', () => {
  it('reports nothing when mirrored at the installed gstack version', () => {
    expect(reviewUpdates('1.51.0.0')).toEqual([]);
  });
  it('reports nothing when the install is OLDER than the mirror', () => {
    expect(reviewUpdates('1.50.0.0')).toEqual([]);
  });
  it('flags every mirrored review + panel when gstack has advanced', () => {
    const behind = reviewUpdates('1.58.4.0');
    expect(behind.map((b) => b.name)).toContain('plan-economist-review');
    expect(behind.map((b) => b.name)).toContain('panel');
    expect(behind.length).toBe(Object.keys(REVIEWS).length + Object.keys(PANELS).length);
    expect(behind[0]).toMatchObject({ mirroredAt: '1.51.0.0', installed: '1.58.4.0' });
  });
});

describe('buildReviewMessages', () => {
  const spec = REVIEWS['reality-check'];
  it('names the axis, the activity, the forcing questions and the current scores', () => {
    const { messages, schema } = buildReviewMessages({ spec, focal, userText: 'it pays great', locale: 'en' });
    const sys = messages[0].content;
    expect(messages[0].role).toBe('system');
    expect(sys).toMatch(/paid/);
    expect(sys).toContain('synth patches');
    expect(sys).toContain(spec.questions[0]);
    expect(sys).toContain('paid 0.80'); // current score anchored
    expect(messages[1].content).toContain('it pays great');
    expect(schema).toBe(REVIEW_SCHEMA);
  });
  it('adds a Spanish language line for es, keeps JSON keys English', () => {
    const { messages } = buildReviewMessages({ spec, focal, userText: '', locale: 'es' });
    expect(messages[0].content).toMatch(/Spanish/);
  });
  it('no language line for en', () => {
    const { messages } = buildReviewMessages({ spec, focal, userText: '', locale: 'en' });
    expect(messages[0].content).not.toMatch(/Write the "message" field in Spanish/);
  });
  it('drives the same turn for any persona from its spec (Liskov)', () => {
    const psych = getReview('plan-psychologist-review');
    const { messages, schema } = buildReviewMessages({ spec: psych, focal, userText: '', locale: 'en' });
    expect(messages[0].content).toMatch(/love/);
    expect(messages[0].content).toContain(psych.questions[0]);
    expect(messages[0].content).toContain('Psychologist review');
    expect(schema).toBe(REVIEW_SCHEMA);
  });
});

describe('REVIEW_SCHEMA validation (the skill validates the agent JSON)', () => {
  const good = { message: 'no receipts', scores: makeScores({ paid: 0.3 }), conf: makeScores({ paid: 0.8 }) };
  it('accepts a well-formed review payload', () => {
    expect(validatePayload(good, REVIEW_SCHEMA).valid).toBe(true);
  });
  it('rejects a missing field', () => {
    const { valid, errors } = validatePayload({ message: 'x', scores: good.scores }, REVIEW_SCHEMA);
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes('conf'))).toBe(true);
  });
  it('rejects an out-of-range axis when checkRange is on', () => {
    const bad = { message: 'x', scores: { love: 0.5, good: 0.5, world: 0.5, paid: 9 }, conf: good.conf };
    expect(validatePayload(bad, REVIEW_SCHEMA, { checkRange: true }).valid).toBe(false);
  });
});
