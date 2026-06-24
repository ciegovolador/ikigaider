// digest.js — a READ MODEL (CQRS query side): summarize a journey's portfolio into
// a few lines of context. Mixing a session "in" doesn't copy its score rows onto
// your map — it brings a SUMMARY the coach reasons over. Pure, no DB, no LLM.
//
// English on purpose: this feeds the model contract (like the rest of the engine),
// not the UI. The user-facing "mixed in X" note is localized separately.

import { AXIS_LABEL, ikigaiScore, classify, bottleneckAxis } from './ikigai.js';

// summarizeJourney(portfolio) -> one line per active activity:
//   "- piano: Passion (ikigai 0.21, weakest What you can be paid for 0.30)"
// Returns '' for an empty journey (nothing to mix).
export function summarizeJourney(portfolio = []) {
  const active = portfolio.filter((a) => a && !a.archived);
  if (!active.length) return '';
  return active
    .map((a) => {
      const state = classify(a.scores).name;
      const I = ikigaiScore(a.scores).toFixed(2);
      const bn = bottleneckAxis(a.scores);
      return `- ${a.name}: ${state} (ikigai ${I}, weakest ${AXIS_LABEL[bn]} ${a.scores[bn].toFixed(2)})`;
    })
    .join('\n');
}
