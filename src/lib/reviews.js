// reviews.js — the self-review SUITE: a fork of gstack's review-skill FORMAT
// aimed at a person's life instead of a startup. Each reviewer is a discipline
// that forces evidence on ONE ikigai axis (anti-sycophancy -> anti-self-delusion).
// This file is the REGISTRY + the shared turn contract. The reviewers themselves
// live one-per-file under ./reviews/, so adding a discipline is copy-one-file.
//
// SOLID:
//   S  one file per reviewer (./reviews/*.js); this file = registry + contract.
//   O  add a reviewer file + one import line — runReview, llm.js, cli.mjs and
//      store.js never change to gain a voice (extend, don't modify).
//   L  every reviewer is a defineReview() spec, interchangeable in runReview.
//   I  a spec carries only { name, axis, mirrors, gstackVersion, voice, questions }.
//   D  the turn depends on the spec abstraction (getReview), never a concrete one.
//
// Stores nothing new: a review re-scores its axis in the existing `scores` table
// tagged source='review' (orchestrator.runReview). Schema + views never change.

import { AXES, AXIS_LABEL } from './ikigai.js';
import { MODEL_BRIEF, scoreSchema } from './prompts.js';

// --- the board: one entry per discipline. Copy a ./reviews/ file to add one. ---
import realityCheck from './reviews/reality-check.js';
import economist from './reviews/plan-economist-review.js';
import craftsman from './reviews/plan-craftsman-review.js';
import psychologist from './reviews/plan-psychologist-review.js';
import anthropologist from './reviews/plan-anthropologist-review.js';

const ALL = [realityCheck, economist, craftsman, psychologist, anthropologist];
export const REVIEWS = Object.fromEntries(ALL.map((r) => [r.name, r]));

// axis -> the board specialist that owns it. reality-check (the gstack/qa mirror)
// stays invocable BY NAME (/review reality-check), not by axis.
const AXIS_REVIEW = {
  paid: 'plan-economist-review',
  good: 'plan-craftsman-review',
  love: 'plan-psychologist-review',
  world: 'plan-anthropologist-review',
};

// --- panels: a chair that CONVENES several specialists (the gstack mentor-review
// + /autoplan shape). A panel is metadata only — an ordered list of member
// reviews the agent runs turn by turn (SKILL.md). No runner change; the board's
// holistic read = its members in sequence.
export const PANELS = {
  'plan-mentor-review': {
    name: 'plan-mentor-review', title: 'Mentor (holistic board)',
    mirrors: 'gstack/mentor-review', gstackVersion: '1.51.0.0',
    members: ['plan-economist-review', 'plan-craftsman-review', 'plan-psychologist-review', 'plan-anthropologist-review'],
  },
  'plan-strategist-review': {
    name: 'plan-strategist-review', title: 'Strategist (direction)',
    mirrors: 'gstack/plan-ceo-review', gstackVersion: '1.51.0.0',
    members: ['plan-anthropologist-review', 'plan-economist-review'], // world + paid = the direction question
  },
  panel: {
    name: 'panel', title: 'Full board', mirrors: 'gstack/autoplan', gstackVersion: '1.51.0.0',
    members: ['plan-economist-review', 'plan-craftsman-review', 'plan-psychologist-review', 'plan-anthropologist-review'],
  },
};

export function getReview(name) { return REVIEWS[name] ?? null; }
export function getPanel(name) { return PANELS[name] ?? null; }

// listCommands: the slash-command catalog for the composer autocomplete (the
// "/" dropdown). Axis shortcuts first, then each review and panel by name. Pure;
// the cmd strings are exactly what parseReviewCommand accepts.
export function listCommands() {
  const axes = AXES.map((a) => ({ cmd: `/review ${a}`, desc: `Review your "${AXIS_LABEL[a].toLowerCase()}" score` }));
  const reviews = Object.values(REVIEWS).map((r) => ({ cmd: `/${r.name}`, desc: `${r.title} — ${AXIS_LABEL[r.axis].toLowerCase()}` }));
  const panels = Object.values(PANELS).map((p) => ({ cmd: `/${p.name}`, desc: `${p.title} — convene the board` }));
  return [...axes, ...reviews, ...panels];
}

// Structured output of a review: a verdict message + a re-estimate of the focal
// activity's axes. Reuses prompts.js scoreSchema so the score shape cannot drift.
export const REVIEW_SCHEMA = {
  name: 'ikigai_review',
  schema: {
    type: 'object',
    properties: { message: { type: 'string' }, scores: scoreSchema, conf: scoreSchema },
    required: ['message', 'scores', 'conf'],
    additionalProperties: false,
  },
};

const LANG_NAMES = { en: 'English', es: 'Spanish' };

// Parse a review command typed into the EXISTING composer. Two equivalent forms,
// matching the gstack convention (each skill is its own slash command):
//   /review <axis|name|panel>   explicit
//   /<review-name|panel-name>    direct, e.g. /reality-check, /plan-economist-review, /panel
// An axis maps to the board specialist that owns it. Returns
//   { reviewName, axis, panel } — panel set for a panel command, else null.
// Returns null for ordinary text OR an unknown /slash word, so a normal coach
// turn is NEVER hijacked (regression: "please review this", "/reviewing", "/foo").
export function parseReviewCommand(text) {
  const t = String(text ?? '').trim();
  const resolve = (tok) => {
    if (PANELS[tok]) return { reviewName: null, axis: '', panel: tok };
    const reviewName = AXIS_REVIEW[tok] ?? (REVIEWS[tok] ? tok : null);
    const axis = AXES.includes(tok) ? tok : (REVIEWS[tok]?.axis ?? '');
    return { reviewName, axis, panel: null };
  };
  // Explicit "/review [token]" is always a review command (even with no token).
  let m = t.match(/^\/review(?:\s+([a-z][a-z0-9-]*))?\s*$/i);
  if (m) return resolve((m[1] || '').toLowerCase());
  // Direct "/<token>" is a review command ONLY if the token names a real review/panel.
  m = t.match(/^\/([a-z][a-z0-9-]*)\s*$/i);
  if (m) {
    const tok = m[1].toLowerCase();
    if (PANELS[tok] || REVIEWS[tok]) return resolve(tok);
  }
  return null;
}

// Build the model messages for a review turn. Persona-agnostic: it reads the
// spec's voice/title/axis/questions, so every reviewer drives the same turn
// (Liskov). Isolated-call contract: judge from THIS exchange's evidence only.
// The model re-estimates all four axes but is told to change ONLY the reviewed
// axis; runReview enforces carry-forward in code regardless.
export function buildReviewMessages({ spec, focal, userText, locale }) {
  const axis = spec.axis;
  const current = AXES.map((a) => `${a} ${focal.scores[a].toFixed(2)}`).join(', ');
  const langLine = locale && locale !== 'en'
    ? `\nWrite the "message" field in ${LANG_NAMES[locale] || 'English'}. Keep all JSON keys in English.`
    : '';

  const sys = `${MODEL_BRIEF}

You are ${spec.voice}. You are running the "${spec.title}" on ONE axis only: "${AXIS_LABEL[axis]}" (${axis}) for the activity "${focal.name}". Do not flatter. Make the person back the current ${axis} score with concrete evidence — specifics, numbers, names, dates — not intentions. A claim with no evidence must LOWER the ${axis} score; solid evidence may keep or raise it.
Insist on these, and judge from the person's answer ONLY:
${spec.questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}${langLine}

Return ONLY a JSON object {"message","scores","conf"}. "message" is your verdict in 2-4 sentences. "scores" re-estimates all four axes for "${focal.name}", but you may ONLY change "${axis}" — keep the other three at their current values. "conf" is your confidence 0..1 per axis.
Current scores for "${focal.name}": ${current}.
Example of the SHAPE only — write your OWN verdict and values, never copy these: {"message":"You named no actual income in the last 90 days, only that it might pay later. That's a hope, not earnings, so paid drops.","scores":{"love":0.5,"good":0.5,"world":0.5,"paid":0.3},"conf":{"love":0.6,"good":0.6,"world":0.6,"paid":0.8}}`;

  return {
    messages: [
      { role: 'system', content: sys },
      { role: 'user', content: `What I said: ${userText || '(begin the review)'}` },
    ],
    schema: REVIEW_SCHEMA,
  };
}

// --- check for updates ("free updates") ------------------------------------
// Each mirrored review/panel records the gstack version it was forked against.
// When the installed gstack advances past that, the upstream skill may have
// improved — flag it so the maintainer re-checks and bumps gstackVersion.
// Pure + node-testable; scripts/check-review-updates.mjs wraps it.
function cmpVersion(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

export function reviewUpdates(installedGstackVersion) {
  const mirrored = [...Object.values(REVIEWS), ...Object.values(PANELS)].filter((r) => r.mirrors && r.gstackVersion);
  return mirrored
    .filter((r) => cmpVersion(r.gstackVersion, installedGstackVersion) < 0)
    .map((r) => ({ name: r.name, mirrors: r.mirrors, mirroredAt: r.gstackVersion, installed: installedGstackVersion }));
}
