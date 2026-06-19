// policy.js — the explore/exploit navigator. Pure logic over a portfolio of
// activities. Knows about ikigai math; knows nothing about React, the DB, or
// the LLM. The LLM phrases the coaching; this module decides the MOVE.
//
// An activity: { id, name, scores: {love,good,world,paid}, conf: {love,...},
//                archived }.  conf in [0,1]: 1 = sure, 0 = a guess.

import { ikigaiScore, bottleneckAxis, classify, AXES, AXIS_LABEL } from './ikigai.js';

// Pure self/money traps: skill and/or pay, but neither love nor world-need.
// High opportunity cost with nothing redeeming, so "stop doing" is on the
// table. ("Comfortable but empty" is excluded — it serves the world, so the
// move there is to add love, not quit.)
const TRAP_STATES = new Set(['0001', '0101', '0100']);

const DEFAULTS = {
  kappa: 0.3,           // exploration bonus weight in UCB
  exploreUncertainty: 0.45, // above this, explore to pin the leader down
  keepScore: 0.5,       // ikigai score at/above which "keep doing" is fine
  lowLove: 0.35,        // below this love, a trap activity is worth dropping
  minPortfolio: 2,      // fewer candidates than this -> go find more
  tau: 0.5,
};

export function uncertainty(a) {
  const c = a.conf || {};
  const mean = AXES.reduce((sum, ax) => sum + (1 - (c[ax] ?? 0.5)), 0) / AXES.length;
  return mean; // 0 = fully confident, 1 = pure guess
}

export function ucb(a, kappa = DEFAULTS.kappa) {
  return ikigaiScore(a.scores) + kappa * uncertainty(a);
}

export function bestActivity(portfolio, kappa = DEFAULTS.kappa) {
  const active = portfolio.filter((a) => !a.archived);
  if (active.length === 0) return null;
  return active.reduce((b, a) => (ucb(a, kappa) > ucb(b, kappa) ? a : b));
}

// decideMove -> {
//   mode: 'explore' | 'exploit',
//   submode: 'adjacent' | 'radical' | 'keep' | 'improve' | 'stop',
//   focusId,        // activity acted on (exploit) or null (explore = new activity)
//   teleport,       // true when focus changes / a new activity appears
//   axis,           // bottleneck axis for 'improve'
//   rationale,      // why this move
//   assignmentHint, // a concrete starting point for the LLM coach
// }
export function decideMove(portfolio, focalId, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const active = portfolio.filter((a) => !a.archived);

  // Not enough options to compare -> explore radically.
  if (active.length < o.minPortfolio) {
    return move('explore', 'radical', null, focalId, {
      rationale: `Only ${active.length} activity in play — scout a clearly different kind of activity so there's something to compare against.`,
      assignmentHint: 'Name one activity that is unlike what you do now and could plausibly matter to you.',
    });
  }

  const best = bestActivity(active, o.kappa);

  // The leader is still a guess -> explore an adjacent activity to refine.
  if (uncertainty(best) > o.exploreUncertainty) {
    return move('explore', 'adjacent', null, focalId, {
      rationale: `Your leading candidate "${best.name}" is still uncertain — explore an activity adjacent to it to sharpen the read.`,
      assignmentHint: `Describe a small variation of "${best.name}" you could actually try this week.`,
    });
  }

  // Otherwise exploit the leader.
  const s = best.scores;
  const score = ikigaiScore(s);
  const st = classify(s, o.tau);
  const axis = bottleneckAxis(s);

  if (score >= o.keepScore && s[axis] >= o.tau) {
    return move('exploit', 'keep', best.id, focalId, {
      rationale: `"${best.name}" already sits near the centre (ikigai ${score.toFixed(2)}). Keep doing it — protect it.`,
      assignmentHint: `Block time to keep "${best.name}" going without diluting it.`,
    });
  }

  if (TRAP_STATES.has(st.key) && s.love < o.lowLove) {
    return move('exploit', 'stop', best.id, focalId, {
      rationale: `"${best.name}" is "${st.name}" — skill/pay without love. Its opportunity cost is high; consider stopping to free room for the search.`,
      assignmentHint: `Decide what you'd reclaim by dropping or shrinking "${best.name}".`,
    });
  }

  return move('exploit', 'improve', best.id, focalId, {
    axis,
    rationale: `"${best.name}" is "${st.name}". Weakest axis: ${AXIS_LABEL[axis]}. Raising it moves the dot toward centre fastest.`,
    assignmentHint: `Take one concrete step this week that raises "${AXIS_LABEL[axis]}" for "${best.name}".`,
  });
}

function move(mode, submode, focusId, focalId, extra) {
  const teleport = mode === 'explore' || (focusId != null && focusId !== focalId);
  return { mode, submode, focusId, teleport, axis: null, ...extra };
}
