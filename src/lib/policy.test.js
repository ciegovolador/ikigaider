import { describe, it, expect } from 'vitest';
import { decideMove, ucb, uncertainty, bestActivity } from './policy.js';
import { makeScores } from './ikigai.js';

const act = (id, name, scores, conf) => ({
  id, name, scores: makeScores(scores),
  conf: conf || { love: 0.9, good: 0.9, world: 0.9, paid: 0.9 },
  archived: false,
});

describe('uncertainty / ucb', () => {
  it('uncertainty is 0 when fully confident', () => {
    expect(uncertainty(act('a', 'x', { love: 0.5 }, { love: 1, good: 1, world: 1, paid: 1 }))).toBe(0);
  });
  it('ucb rewards exploration bonus', () => {
    const sure = act('a', 'sure', { love: 0.5, good: 0.5, world: 0.5, paid: 0.5 });
    const guess = act('b', 'guess', { love: 0.5, good: 0.5, world: 0.5, paid: 0.5 },
      { love: 0.2, good: 0.2, world: 0.2, paid: 0.2 });
    expect(ucb(guess)).toBeGreaterThan(ucb(sure));
  });
});

describe('decideMove', () => {
  it('explores radically when the portfolio is too small', () => {
    const m = decideMove([act('a', 'solo', { love: 0.6, good: 0.6, world: 0.6, paid: 0.6 })], 'a');
    expect(m.mode).toBe('explore');
    expect(m.submode).toBe('radical');
    expect(m.teleport).toBe(true);
  });

  it('explores adjacent when the leader is uncertain', () => {
    const p = [
      act('a', 'leader', { love: 0.7, good: 0.7, world: 0.7, paid: 0.7 },
        { love: 0.2, good: 0.2, world: 0.2, paid: 0.2 }),
      act('b', 'other', { love: 0.3, good: 0.3, world: 0.3, paid: 0.3 }),
    ];
    const m = decideMove(p, 'a');
    expect(m.mode).toBe('explore');
    expect(m.submode).toBe('adjacent');
  });

  it('improves the weakest axis when confident but off-centre', () => {
    const p = [
      act('a', 'job', { love: 0.2, good: 0.8, world: 0.8, paid: 0.8 }),
      act('b', 'other', { love: 0.1, good: 0.1, world: 0.1, paid: 0.1 }),
    ];
    const m = decideMove(p, 'a');
    expect(m.mode).toBe('exploit');
    expect(m.submode).toBe('improve');
    expect(m.axis).toBe('love');
  });

  it('suggests stopping a high-pay low-love trap (Profession)', () => {
    const p = [
      act('a', 'consulting', { love: 0.15, good: 0.7, world: 0.2, paid: 0.9 }),
      act('b', 'other', { love: 0.1, good: 0.1, world: 0.1, paid: 0.1 }),
    ];
    // 'a' is Profession (skill+pay, no love, no world-need); love < 0.35 -> stop
    const m = decideMove(p, 'a');
    expect(m.mode).toBe('exploit');
    expect(m.submode).toBe('stop');
  });

  it('keeps doing an activity already near centre', () => {
    const p = [
      act('a', 'craft', { love: 0.85, good: 0.85, world: 0.85, paid: 0.85 }),
      act('b', 'other', { love: 0.2, good: 0.2, world: 0.2, paid: 0.2 }),
    ];
    const m = decideMove(p, 'a');
    expect(m.mode).toBe('exploit');
    expect(m.submode).toBe('keep');
  });
});
