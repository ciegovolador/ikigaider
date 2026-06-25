// _define.js — the reviewer TEMPLATE. Every discipline on the board is ONE file
// that exports `defineReview({...})`, so adding a reviewer is copy-one-file. The
// factory normalizes + validates the shape, which is what makes every reviewer
// interchangeable in orchestrator.runReview (Liskov) and lets the turn depend on
// this abstraction alone, never a concrete persona (Dependency Inversion).
//
// A spec is deliberately small (Interface Segregation):
//   name         kebab id, also the /review <name> and cli --review <name>
//   axis         the ONE ikigai axis this reviewer re-scores (love/good/world/paid)
//   mirrors      the gstack skill it forks ("gstack/plan-eng-review") — the parity
//                hook for `npm run reviews:check` (free updates)
//   gstackVersion the gstack release it was mirrored against (drift detection)
//   title        human label shown to the model
//   voice        the persona's stance (anti-self-delusion, one line)
//   questions    the forcing questions; evidence in, score out

import { AXES } from '../ikigai.js';

export function defineReview(spec) {
  const { name, axis, mirrors, gstackVersion, title, voice, questions } = spec;
  if (!name) throw new Error('review needs a name');
  if (!axis || !AXES.includes(axis)) throw new Error(`review "${name}": axis must be one of ${AXES.join('/')}`);
  if (!Array.isArray(questions) || questions.length === 0) throw new Error(`review "${name}" needs at least one forcing question`);
  return {
    name, axis,
    mirrors: mirrors ?? null,
    gstackVersion: gstackVersion ?? null,
    title: title ?? name,
    voice: voice ?? '',
    questions,
  };
}
