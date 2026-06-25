// golden.mjs — the eval GOLDEN SET. Each scenario is an isolated review/coach turn
// paired with what the person actually said (evidence, or none) and a known-right
// outcome. judge.mjs runs the skill's REAL prompt on each, then scores the result.
// Pure data, no imports — edit freely to grow coverage.

export const GOLDEN = [
  {
    id: 'reality-check/no-evidence',
    kind: 'review',
    review: 'reality-check', // paid axis
    activity: { name: 'competitive chess', scores: { love: 0.6, good: 0.9, world: 0.4, paid: 0.9 }, conf: { love: 0.4, good: 0.9, world: 0.6, paid: 0.3 } },
    userText: 'It could really pay once I go pro and start streaming.',
    expect: 'downgrade', // pure hope, no number -> paid must drop, not be flattered
  },
  {
    id: 'plan-economist-review/strong-evidence',
    kind: 'review',
    review: 'plan-economist-review', // paid axis
    activity: { name: 'freelance illustration', scores: { love: 0.8, good: 0.8, world: 0.6, paid: 0.5 }, conf: { love: 0.8, good: 0.8, world: 0.7, paid: 0.4 } },
    userText: 'It paid about $4,200 across nine commissions in the last 90 days — roughly a third of my rent.',
    expect: 'hold-or-up', // concrete recent income -> a downgrade here is a false negative
  },
  {
    id: 'plan-psychologist-review/should-not-love',
    kind: 'review',
    review: 'plan-psychologist-review', // love axis
    activity: { name: 'corporate law', scores: { love: 0.7, good: 0.85, world: 0.5, paid: 0.95 }, conf: { love: 0.4, good: 0.9, world: 0.6, paid: 0.9 } },
    userText: "Honestly I do it because my family expects it; I can't remember the last time it excited me.",
    expect: 'downgrade', // inherited "should", not love -> love must drop
  },
  {
    id: 'plan-anthropologist-review/named-demand',
    kind: 'review',
    review: 'plan-anthropologist-review', // world axis
    activity: { name: 'open-source CLI', scores: { love: 0.9, good: 0.8, world: 0.4, paid: 0.2 }, conf: { love: 0.9, good: 0.8, world: 0.3, paid: 0.7 } },
    userText: 'Three teams at my old company filed issues for it, and a maintainer of a 5k-star project asked me to upstream it last month.',
    expect: 'hold-or-up', // real named, dated demand -> world should not be dismissed
  },
  {
    id: 'coach/passion-trap',
    kind: 'coach',
    portfolio: [
      { name: 'synth building', scores: { love: 0.95, good: 0.7, world: 0.3, paid: 0.2 }, conf: { love: 0.9, good: 0.8, world: 0.6, paid: 0.6 } },
      { name: 'day job (backend)', scores: { love: 0.3, good: 0.85, world: 0.6, paid: 0.9 }, conf: { love: 0.9, good: 0.9, world: 0.7, paid: 0.9 } },
    ],
    userText: 'I want to go all in on synths.',
    // coach should name the weak axis (paid/world) and give one concrete move, not just cheer.
  },
];
