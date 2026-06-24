import { describe, it, expect } from 'vitest';
import {
  buildAssessMessages,
  buildCoachMessages,
  validatePayload,
  parseModelJson,
  ASSESS_SCHEMA,
  COACH_SCHEMA,
} from './prompts.js';

describe('buildAssessMessages', () => {
  it('returns a system+user pair and the assess schema', () => {
    const { messages, schema } = buildAssessMessages('I teach piano');
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('system');
    expect(messages[1]).toEqual({ role: 'user', content: 'I teach piano' });
    expect(schema).toBe(ASSESS_SCHEMA);
  });
  it('embeds the rubric brief in the system prompt', () => {
    const { messages } = buildAssessMessages('x');
    expect(messages[0].content).toContain('ikigai diagram');
    expect(messages[0].content).toContain('confidence');
  });
});

describe('buildCoachMessages', () => {
  const base = {
    move: { mode: 'exploit', submode: 'improve', rationale: 'fix pay' },
    focal: { name: 'music tools' },
    portfolio: [{ name: 'music tools', scores: { love: 0.9, good: 0.6, world: 0.5, paid: 0.2 } }],
    userText: 'charging now',
  };
  it('returns the coach schema and renders the portfolio', () => {
    const { messages, schema } = buildCoachMessages({ ...base, locale: 'en' });
    expect(schema).toBe(COACH_SCHEMA);
    expect(messages[1].content).toContain('music tools: love 0.90');
    expect(messages[1].content).toContain('charging now');
  });
  it('omits the language line for English', () => {
    const { messages } = buildCoachMessages({ ...base, locale: 'en' });
    expect(messages[0].content).not.toMatch(/Write the "message" field/);
  });
  it('adds a Spanish language line for es (keys stay English)', () => {
    const { messages } = buildCoachMessages({ ...base, locale: 'es' });
    expect(messages[0].content).toContain('Write the "message" field in Spanish');
    expect(messages[0].content).toContain('Keep all JSON keys and activity names in English');
  });
  it('threads a mixed-in context block into the user message (context-only)', () => {
    const { messages } = buildCoachMessages({ ...base, locale: 'en', context: '- side gig: Paycheck (ikigai 0.05, weakest What you love 0.10)' });
    expect(messages[1].content).toContain('another session');
    expect(messages[1].content).toContain('side gig: Paycheck');
    expect(messages[1].content).toMatch(/do not re-score/i);
  });
  it('omits the context block when no context is mixed in', () => {
    const { messages } = buildCoachMessages({ ...base, locale: 'en' });
    expect(messages[1].content).not.toMatch(/another session/);
  });
});

describe('validatePayload', () => {
  const okActivity = {
    name: 'x',
    scores: { love: 0.5, good: 0.5, world: 0.5, paid: 0.5 },
    conf: { love: 0.5, good: 0.5, world: 0.5, paid: 0.5 },
  };
  it('accepts a well-formed assess payload', () => {
    const r = validatePayload({ activities: [okActivity] }, ASSESS_SCHEMA);
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
  });
  it('accepts an empty activities array', () => {
    expect(validatePayload({ activities: [] }, ASSESS_SCHEMA).valid).toBe(true);
  });
  it('flags a missing required field', () => {
    const r = validatePayload({ activities: [{ name: 'x', scores: okActivity.scores }] }, ASSESS_SCHEMA);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('conf'))).toBe(true);
  });
  it('flags an out-of-range axis score', () => {
    const bad = { ...okActivity, scores: { ...okActivity.scores, love: 1.7 } };
    const r = validatePayload({ activities: [bad] }, ASSESS_SCHEMA);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('out of range'))).toBe(true);
  });
  it('flags a non-number score', () => {
    const bad = { ...okActivity, scores: { ...okActivity.scores, love: 'high' } };
    expect(validatePayload({ activities: [bad] }, ASSESS_SCHEMA).valid).toBe(false);
  });
  it('with checkRange:false accepts out-of-range numbers (clamp handles it) but still flags structure', () => {
    const hi = { ...okActivity, scores: { ...okActivity.scores, love: 1.7 } };
    expect(validatePayload({ activities: [hi] }, ASSESS_SCHEMA, { checkRange: false }).valid).toBe(true);
    const bad = { ...okActivity, scores: { ...okActivity.scores, love: 'high' } };
    expect(validatePayload({ activities: [bad] }, ASSESS_SCHEMA, { checkRange: false }).valid).toBe(false);
  });
  it('validates a coach payload (message + arrays)', () => {
    const r = validatePayload({ message: 'go', updates: [okActivity], created: [] }, COACH_SCHEMA);
    expect(r.valid).toBe(true);
  });
  it('flags a coach payload missing message', () => {
    const r = validatePayload({ updates: [], created: [] }, COACH_SCHEMA);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('message'))).toBe(true);
  });
});

describe('parseModelJson (re-homed from llm.js)', () => {
  it('parses fenced JSON', () => {
    expect(parseModelJson('```json\n{"activities":[]}\n```')).toEqual({ activities: [] });
  });
  it('throws a helpful error on non-JSON', () => {
    expect(() => parseModelJson('sorry, no')).toThrow(/did not return valid JSON/);
  });
});
