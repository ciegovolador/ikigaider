import { describe, it, expect } from 'vitest';
import { extractJson, completionsUrl } from './llm.js';

describe('completionsUrl', () => {
  it('appends /v1/chat/completions to a bare host', () => {
    expect(completionsUrl('http://127.0.0.1:1234')).toBe('http://127.0.0.1:1234/v1/chat/completions');
  });
  it('adds chat/completions to a /v1 base', () => {
    expect(completionsUrl('http://localhost:1234/v1')).toBe('http://localhost:1234/v1/chat/completions');
  });
  it('tolerates a trailing slash', () => {
    expect(completionsUrl('http://localhost:1234/v1/')).toBe('http://localhost:1234/v1/chat/completions');
  });
  it('leaves a full completions URL alone', () => {
    expect(completionsUrl('http://x/v1/chat/completions')).toBe('http://x/v1/chat/completions');
  });
  it('returns empty for blank', () => {
    expect(completionsUrl('')).toBe('');
  });
});

describe('extractJson', () => {
  it('parses a bare object', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });
  it('strips ```json fences', () => {
    expect(extractJson('here:\n```json\n{"a":2}\n```\nthanks')).toEqual({ a: 2 });
  });
  it('grabs the object when surrounded by prose', () => {
    expect(extractJson('Sure! {"name":"x","scores":{"love":0.5}} done')).toEqual({
      name: 'x', scores: { love: 0.5 },
    });
  });
  it('throws when there is no object', () => {
    expect(() => extractJson('no json here')).toThrow();
  });
});
