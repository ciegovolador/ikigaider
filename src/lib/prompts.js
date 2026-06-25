// prompts.js — the model CONTRACT, shared by every front door (web, skill, MCP).
// Pure: no transport, no DB, no React. Holds the system briefs, the JSON
// schemas, the message BUILDERS (assess/coach), and the parse + validate utils.
//
// Why this is its own module: "three doors, one product" only holds if every
// door sends the model the IDENTICAL prompts and expects the IDENTICAL shape.
// llm.js (web/BYO transport) and the skill's cli.mjs both import from here, so
// tuning a prompt changes all doors at once — it cannot drift.
//
//   buildAssessMessages(desc)           -> { messages, schema }
//   buildCoachMessages({...})           -> { messages, schema }
//   extractJson / parseModelJson        -> tolerant JSON out of a model reply
//   validatePayload(payload, schema)    -> structural check (the SKILL uses this;
//                                          the web relies on makeScores instead)

import { rubricText } from './assessments.js';
import { AXES } from './ikigai.js';

export const MODEL_BRIEF = `You map life activities onto the ikigai diagram. Four axes, each 0..1:
${rubricText()}
Score an activity ONLY against the rubric anchors above. Always also give a
confidence 0..1 per axis (how sure you are given what the person told you).
ikigai is the product of the four axes; the centre needs all four high.`;

// --- JSON schemas for structured output -----------------------------------
// Strict mode requires every property in `required`, so shapes stay minimal.
// Exported so reviews.js can reuse the exact axis-score shape (DRY — the review
// schema must not redefine what an axis-score object looks like).
export const scoreSchema = {
  type: 'object',
  properties: Object.fromEntries(AXES.map((a) => [a, { type: 'number' }])),
  required: [...AXES],
  additionalProperties: false,
};
const activitySchema = {
  type: 'object',
  properties: { name: { type: 'string' }, scores: scoreSchema, conf: scoreSchema },
  required: ['name', 'scores', 'conf'],
  additionalProperties: false,
};
export const ASSESS_SCHEMA = {
  name: 'ikigai_assessment',
  schema: {
    type: 'object',
    properties: { activities: { type: 'array', items: activitySchema } },
    required: ['activities'],
    additionalProperties: false,
  },
};
export const COACH_SCHEMA = {
  name: 'ikigai_coach',
  schema: {
    type: 'object',
    properties: {
      message: { type: 'string' },
      updates: { type: 'array', items: activitySchema },
      created: { type: 'array', items: activitySchema },
    },
    required: ['message', 'updates', 'created'],
    additionalProperties: false,
  },
};

// --- parse -----------------------------------------------------------------
// Tolerant JSON extraction: strips ``` fences, grabs the first {...} block.
export function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object in model reply');
  return JSON.parse(body.slice(start, end + 1));
}

// Parse JSON from a model reply, surfacing the raw text when it isn't JSON.
export function parseModelJson(text) {
  try {
    return extractJson(text);
  } catch {
    throw new Error(`Model did not return valid JSON. It replied: "${text.slice(0, 200)}"`);
  }
}

// --- validate --------------------------------------------------------------
// Minimal structural validator for OUR schemas (object/array/number/string +
// properties/required/items). The web path never calls this — it clamps via
// makeScores and trusts the server's response_format. The skill DOES call it,
// because the harness agent has no server-side json_schema enforcement.
// Returns { valid, errors:[string] }. Numbers must be finite and in [0,1]
// (every number in our schemas is an axis score or confidence).
function checkNode(value, schema, path, errors, checkRange) {
  if (schema.type === 'object') {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      errors.push(`${path || 'root'}: expected object`);
      return;
    }
    for (const key of schema.required || []) {
      if (!(key in value)) errors.push(`${path}${path ? '.' : ''}${key}: missing`);
    }
    for (const [key, sub] of Object.entries(schema.properties || {})) {
      if (key in value) checkNode(value[key], sub, `${path}${path ? '.' : ''}${key}`, errors, checkRange);
    }
  } else if (schema.type === 'array') {
    if (!Array.isArray(value)) {
      errors.push(`${path}: expected array`);
      return;
    }
    value.forEach((item, i) => checkNode(item, schema.items, `${path}[${i}]`, errors, checkRange));
  } else if (schema.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      errors.push(`${path}: expected finite number`);
    } else if (checkRange && (value < 0 || value > 1)) {
      errors.push(`${path}: ${value} out of range [0,1]`);
    }
  } else if (schema.type === 'string') {
    if (typeof value !== 'string') errors.push(`${path}: expected string`);
  }
}

// Accepts either a wrapper ({ name, schema }) or a bare JSON schema.
// checkRange=true rejects axis numbers outside [0,1]; the skill passes false to
// validate STRUCTURE only (missing field / wrong type → retry) and let
// makeScores clamp the range — a slightly-off score shouldn't fail a turn.
export function validatePayload(payload, schemaOrWrapper, { checkRange = true } = {}) {
  const schema = schemaOrWrapper?.schema ?? schemaOrWrapper;
  const errors = [];
  checkNode(payload, schema, '', errors, checkRange);
  return { valid: errors.length === 0, errors };
}

// --- message builders ------------------------------------------------------
// assess: turn free text into one or more scored candidate activities.
export function buildAssessMessages(description) {
  const sys = `${MODEL_BRIEF}

Output ONLY a JSON object with an "activities" array. Each activity has a "name",
a "scores" object and a "conf" object, both with keys ${AXES.join('/')} in 0..1.
Extract 1-3 concrete activities the person mentions or implies, scored honestly
(low scores are fine). If they have NOT named any concrete activity yet, return
{"activities":[]} — do not ask questions, just the empty array.
Example of the SHAPE only — write your own values, never copy these:
{"activities":[{"name":"teaching piano","scores":{"love":0.8,"good":0.7,"world":0.5,"paid":0.4},"conf":{"love":0.9,"good":0.8,"world":0.6,"paid":0.7}}]}`;
  return {
    messages: [
      { role: 'system', content: sys },
      { role: 'user', content: description },
    ],
    schema: ASSESS_SCHEMA,
  };
}

const LANG_NAMES = { en: 'English', es: 'Spanish' };

// coach: given the decided move, phrase the coaching and re-estimate scores.
// `locale` localizes the coaching prose only — the JSON contract stays English.
export function buildCoachMessages({ move, focal, portfolio, userText, locale, context }) {
  const portfolioText = portfolio
    .map((a) => `- ${a.name}: ${AXES.map((ax) => `${ax} ${a.scores[ax].toFixed(2)}`).join(', ')}`)
    .join('\n');

  const langLine = locale && locale !== 'en'
    ? `\nWrite the "message" field in ${LANG_NAMES[locale] || 'English'}. Keep all JSON keys and activity names in English.`
    : '';

  const sys = `${MODEL_BRIEF}

You are a navigator using explore/exploit. The MOVE has already been decided by
the system — do not override it. Coach toward it in 2-4 sentences, concrete and
direct, no hedging. Then re-estimate scores for any activity you learned more
about, and (only for explore moves) you may propose ONE new activity.${langLine}

Decided move: ${move.mode}/${move.submode}${move.axis ? ` (axis: ${move.axis})` : ''}
Why: ${move.rationale}
Focal activity: ${focal ? focal.name : '(none yet)'}

Return ONLY a JSON object with keys "message", "updates", "created". "message" is
your real coaching as plain text, 2-4 sentences — write it yourself, never output a
placeholder. "updates" re-scores activities you learned more about; "created" adds
ONE new activity on explore moves only. Both arrays may be empty.
Example of the SHAPE only — write your own values, never copy these:
{"message":"Building synths is pure Passion: real skill and love, but it doesn't pay yet and few people need it. Put a price on one patch pack this month to lift the paid axis.","updates":[{"name":"building synths","scores":{"love":0.9,"good":0.7,"world":0.3,"paid":0.3},"conf":{"love":0.9,"good":0.8,"world":0.6,"paid":0.7}}],"created":[]}`;

  // `context` = a summary the person mixed in from another session. It rides as
  // background the coach reasons over, but is NOT re-scored into the portfolio.
  const contextBlock = context
    ? `\n\nBackground the person carried in from another session (context only, do not re-score it):\n${context}`
    : '';

  return {
    messages: [
      { role: 'system', content: sys },
      { role: 'user', content: `Portfolio:\n${portfolioText}${contextBlock}\n\nWhat I said: ${userText || '(start)'}` },
    ],
    schema: COACH_SCHEMA,
  };
}
