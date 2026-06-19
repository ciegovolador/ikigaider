// ikigai.js — the math core. Pure functions only: no React, no DB, no LLM.
//
// An activity is scored on four axes, each in [0,1]:
//   love  = what you love           (top of the map)
//   good  = what you're good at      (left)
//   world = what the world needs     (right)
//   paid  = what you can be paid for (bottom)
//
// The center of the ikigai Venn is the INTERSECTION of all four circles, so an
// activity's ikigai score is the PRODUCT of its axis scores. Gradient ascent on
// that product pushes hardest on the weakest axis (see gradient()).

export const AXES = ['love', 'good', 'world', 'paid'];

export const AXIS_LABEL = {
  love: 'What you love',
  good: "What you're good at",
  world: 'What the world needs',
  paid: 'What you can be paid for',
};

export const clamp01 = (n) => Math.max(0, Math.min(1, n));

export function makeScores(partial = {}) {
  const s = {};
  for (const a of AXES) s[a] = clamp01(partial[a] ?? 0);
  return s;
}

// ikigaiScore: product of the four axes. Peaks at 1 when all four are 1.
export function ikigaiScore(s) {
  return s.love * s.good * s.world * s.paid;
}

// gradient: partial derivative of the product wrt each axis = product of the
// other three. The component for the lowest-scoring axis is the largest
// (excluding the smallest factor leaves the biggest product), so ascent
// naturally prioritises your weakest dimension.
export function gradient(s) {
  return {
    love: s.good * s.world * s.paid,
    good: s.love * s.world * s.paid,
    world: s.love * s.good * s.paid,
    paid: s.love * s.good * s.world,
  };
}

// bottleneckAxis: the axis to fix next = lowest score (= largest gradient).
export function bottleneckAxis(s) {
  return AXES.reduce((lo, a) => (s[a] < s[lo] ? a : lo), AXES[0]);
}

// project: map the 4-axis vector onto the 2D map. love=top, paid=bottom,
// good=left, world=right. Both x and y in [0,1]; y grows downward (SVG).
export function project(s) {
  return {
    x: 0.5 + (s.world - s.good) / 2,
    y: 0.5 - (s.love - s.paid) / 2,
  };
}

// --- The 16 explicit states (power set of the four axes) -------------------
// key is a 4-char bitstring in axis order [love, good, world, paid].

function bits(s, tau) {
  return AXES.map((a) => (s[a] >= tau ? '1' : '0')).join('');
}

export const STATES = {
  '0000': { name: 'Lost', felt: 'Adrift — nothing aligns yet.' },
  '1000': { name: 'Daydream', felt: 'You love it, but lack skill, need and pay.' },
  '0100': { name: 'Idle Skill', felt: "A talent you don't enjoy, need, or get paid for." },
  '0010': { name: 'Charity Gap', felt: "Needed by the world, but you don't love it, aren't good, aren't paid." },
  '0001': { name: 'Paycheck', felt: "It pays, but no love, no skill, no need." },
  '1100': { name: 'Passion', felt: 'Love + skill — but unmet need and unpaid.' },
  '1010': { name: 'Mission', felt: 'Love + the world needs it — but unskilled and unpaid.' },
  '0101': { name: 'Profession', felt: 'Skill + pay — but no love and unneeded.' },
  '0011': { name: 'Vocation', felt: 'The world needs it + it pays — but no love, no skill.' },
  '1001': { name: 'Indulgence', felt: 'You love it and it pays — but unskilled and unneeded.' },
  '0110': { name: 'Duty', felt: "Skill + need — but you don't love it and aren't paid." },
  '1110': { name: 'Happy, no wealth', felt: 'Happy and fulfilled, but no wealth. (missing: paid)' },
  '1101': { name: 'Useless but satisfied', felt: 'Satisfied, but feeling useless. (missing: world)' },
  '1011': { name: 'Excited but uncertain', felt: 'Excited and self-approving, but uncertain. (missing: good)' },
  '0111': { name: 'Comfortable but empty', felt: 'Comfortable, but empty. (missing: love)' },
  '1111': { name: 'IKIGAI', felt: 'Your reason for being — all four align.' },
};

// classify: which of the 16 states an activity occupies, at threshold tau.
export function classify(s, tau = 0.5) {
  const key = bits(s, tau);
  const present = AXES.filter((a) => s[a] >= tau);
  const missing = AXES.filter((a) => s[a] < tau);
  return { key, present, missing, ...STATES[key] };
}

// distance between two score vectors (used for explore jump length).
export function distance(a, b) {
  return Math.sqrt(AXES.reduce((sum, ax) => sum + (a[ax] - b[ax]) ** 2, 0));
}
