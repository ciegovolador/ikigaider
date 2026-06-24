import { describe, it, expect } from 'vitest';
import { summarizeJourney } from './digest.js';
import { makeScores } from './ikigai.js';

const act = (name, s, archived = false) => ({ name, scores: makeScores(s), archived });

describe('summarizeJourney (mix read model)', () => {
  it('returns one line per active activity with state + ikigai + weakest axis', () => {
    const out = summarizeJourney([
      act('piano', { love: 0.9, good: 0.7, world: 0.5, paid: 0.3 }),
      act('day job', { love: 0.2, good: 0.85, world: 0.6, paid: 0.9 }),
    ]);
    const lines = out.split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('piano:');
    expect(lines[0]).toContain('ikigai');
    expect(lines[0]).toContain('weakest What you can be paid for 0.30'); // bottleneck = paid
  });

  it('skips archived activities', () => {
    const out = summarizeJourney([
      act('kept', { love: 0.5, good: 0.5, world: 0.5, paid: 0.5 }),
      act('gone', { love: 0.5, good: 0.5, world: 0.5, paid: 0.5 }, true),
    ]);
    expect(out.split('\n')).toHaveLength(1);
    expect(out).toContain('kept');
  });

  it('returns empty string for an empty journey (nothing to mix)', () => {
    expect(summarizeJourney([])).toBe('');
    expect(summarizeJourney([act('a', {}, true)])).toBe('');
  });
});
