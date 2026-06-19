import { describe, it, expect } from 'vitest';
import {
  AXES, makeScores, ikigaiScore, gradient, bottleneckAxis,
  project, classify, distance,
} from './ikigai.js';

describe('ikigaiScore', () => {
  it('peaks at all-ones', () => {
    expect(ikigaiScore(makeScores({ love: 1, good: 1, world: 1, paid: 1 }))).toBe(1);
  });
  it('is zero if any axis is zero', () => {
    expect(ikigaiScore(makeScores({ love: 1, good: 1, world: 1, paid: 0 }))).toBe(0);
  });
});

describe('gradient', () => {
  it('component for an axis = product of the other three', () => {
    const s = makeScores({ love: 0.5, good: 0.5, world: 0.5, paid: 0.5 });
    expect(gradient(s).love).toBeCloseTo(0.125);
  });
  it('is largest on the weakest axis', () => {
    const s = makeScores({ love: 0.2, good: 0.8, world: 0.8, paid: 0.8 });
    const g = gradient(s);
    const maxAxis = AXES.reduce((m, a) => (g[a] > g[m] ? a : m), AXES[0]);
    expect(maxAxis).toBe('love');
    expect(bottleneckAxis(s)).toBe('love');
  });
});

describe('project', () => {
  it('places love at the top (small y) and paid at the bottom', () => {
    const top = project(makeScores({ love: 1 }));
    const bottom = project(makeScores({ paid: 1 }));
    expect(top.y).toBeLessThan(0.5);
    expect(bottom.y).toBeGreaterThan(0.5);
  });
  it('places good on the left and world on the right', () => {
    expect(project(makeScores({ good: 1 })).x).toBeLessThan(0.5);
    expect(project(makeScores({ world: 1 })).x).toBeGreaterThan(0.5);
  });
});

describe('classify — the 16 states', () => {
  const hi = 0.8, lo = 0.2;
  it('all-high = IKIGAI', () => {
    expect(classify(makeScores({ love: hi, good: hi, world: hi, paid: hi })).name).toBe('IKIGAI');
  });
  it('all-low = Lost', () => {
    expect(classify(makeScores({})).name).toBe('Lost');
  });
  it('good+world+paid, no love = Comfortable but empty', () => {
    const c = classify(makeScores({ love: lo, good: hi, world: hi, paid: hi }));
    expect(c.name).toBe('Comfortable but empty');
    expect(c.missing).toEqual(['love']);
  });
  it('love+good+world, no paid = Happy, no wealth', () => {
    expect(classify(makeScores({ love: hi, good: hi, world: hi, paid: lo })).name)
      .toBe('Happy, no wealth');
  });
  it('love+good+paid, no world = Useless but satisfied', () => {
    expect(classify(makeScores({ love: hi, good: hi, world: lo, paid: hi })).name)
      .toBe('Useless but satisfied');
  });
  it('love+world+paid, no good = Excited but uncertain', () => {
    expect(classify(makeScores({ love: hi, good: lo, world: hi, paid: hi })).name)
      .toBe('Excited but uncertain');
  });
  it('named pairs', () => {
    expect(classify(makeScores({ love: hi, good: hi })).name).toBe('Passion');
    expect(classify(makeScores({ love: hi, world: hi })).name).toBe('Mission');
    expect(classify(makeScores({ good: hi, paid: hi })).name).toBe('Profession');
    expect(classify(makeScores({ world: hi, paid: hi })).name).toBe('Vocation');
  });
  it('covers all 16 keys uniquely', () => {
    const keys = new Set();
    for (let i = 0; i < 16; i++) {
      const s = makeScores({
        love: i & 8 ? hi : lo, good: i & 4 ? hi : lo,
        world: i & 2 ? hi : lo, paid: i & 1 ? hi : lo,
      });
      keys.add(classify(s).key);
    }
    expect(keys.size).toBe(16);
  });
});

describe('distance', () => {
  it('is zero for identical vectors', () => {
    const s = makeScores({ love: 0.4, good: 0.6, world: 0.3, paid: 0.7 });
    expect(distance(s, s)).toBe(0);
  });
});
