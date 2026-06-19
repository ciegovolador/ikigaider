// llm.js — bring-your-own-LLM client (OpenAI-compatible /chat/completions).
// Single responsibility: talk to the model and return parsed JSON. The math
// (ikigai.js) and the move decision (policy.js) live elsewhere; the LLM only
// estimates scores and phrases coaching.

import { rubricText } from './assessments.js';
import { AXES } from './ikigai.js';
import { isBrowserProvider, browserChat } from './webllm.js';

const MODEL_BRIEF = `You map life activities onto the ikigai diagram. Four axes, each 0..1:
${rubricText()}
Score an activity ONLY against the rubric anchors above. Always also give a
confidence 0..1 per axis (how sure you are given what the person told you).
ikigai is the product of the four axes; the centre needs all four high.`;

// Build the chat-completions URL tolerantly: accept a bare host
// (http://127.0.0.1:1234), a /v1 base, or a full .../chat/completions URL.
export function completionsUrl(base) {
  const b = (base || '').trim().replace(/\/+$/, '');
  if (!b) return '';
  if (/\/chat\/completions$/.test(b)) return b;
  if (/\/v\d+$/.test(b)) return `${b}/chat/completions`;
  return `${b}/v1/chat/completions`;
}

export async function chatRaw(config, messages, { temperature = 0.2, schema = null } = {}) {
  // In-browser provider (WebGPU): no endpoint, no key. Same return contract.
  if (isBrowserProvider(config.base_url)) {
    return browserChat(config, messages, { temperature, schema });
  }
  const url = completionsUrl(config.base_url);
  if (!url) {
    throw new Error('No Base URL set. Open config and enter your endpoint, e.g. http://localhost:1234 for LM Studio.');
  }
  const headers = {
    'Content-Type': 'application/json',
    ...(config.api_key ? { Authorization: `Bearer ${config.api_key}` } : {}),
  };
  const base = { model: config.model || 'local', temperature, messages };
  const structured = schema
    ? { ...base, response_format: { type: 'json_schema', json_schema: { name: schema.name, strict: true, schema: schema.schema } } }
    : base;

  const post = async (payload) => {
    try {
      return await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
    } catch (e) {
      // Browser fetch throws a TypeError for network failures AND blocked CORS.
      throw new Error(
        `Could not reach ${url} (${e.message}). Check the server is running ` +
        `and CORS is enabled (LM Studio: Developer tab → Settings → "Enable CORS").`
      );
    }
  };

  let res = await post(structured);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    // Some servers reject structured output — fall back to prompt-only (BYO-agnostic).
    if (schema && res.status === 400 && /response_format|json_schema|json_object|schema/i.test(body)) {
      res = await post(base);
      if (!res.ok) {
        const b2 = await res.text().catch(() => '');
        throw new Error(`LLM ${res.status} ${res.statusText}: ${b2.slice(0, 300)}`);
      }
    } else {
      throw new Error(`LLM ${res.status} ${res.statusText}: ${body.slice(0, 300)}`);
    }
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content ?? '';
  if (!content) throw new Error('Model returned empty content (is a model loaded and the model name correct?).');
  return content;
}

// JSON schemas for structured output. Strict mode requires every property to
// be listed in `required`, so we keep the shapes minimal (no optional fields).
const scoreSchema = {
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
const ASSESS_SCHEMA = {
  name: 'ikigai_assessment',
  schema: {
    type: 'object',
    properties: { activities: { type: 'array', items: activitySchema } },
    required: ['activities'],
    additionalProperties: false,
  },
};
const COACH_SCHEMA = {
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

// Parse JSON from a model reply, surfacing the raw text when it isn't JSON.
function parseModelJson(text) {
  try {
    return extractJson(text);
  } catch {
    throw new Error(`Model did not return valid JSON. It replied: "${text.slice(0, 200)}"`);
  }
}

// Tolerant JSON extraction: strips ``` fences, grabs the first {...} block.
export function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object in model reply');
  return JSON.parse(body.slice(start, end + 1));
}

// assess: turn free text into one or more scored candidate activities.
export async function assess(config, description) {
  const sys = `${MODEL_BRIEF}

Output ONLY a JSON object of the form:
{"activities":[{"name":"...","scores":{${AXES.map((a) => `"${a}":0..1`).join(',')}},"conf":{${AXES.map((a) => `"${a}":0..1`).join(',')}}}]}
Extract 1-3 concrete activities the person mentions or implies, scored honestly
(low scores are fine). If they have NOT named any concrete activity yet, return
{"activities":[]} — do not ask questions, just return the empty array.`;
  const out = await chatRaw(config, [
    { role: 'system', content: sys },
    { role: 'user', content: description },
  ], { schema: ASSESS_SCHEMA });
  return parseModelJson(out);
}

const LANG_NAMES = { en: 'English', es: 'Spanish' };

// coach: given the decided move, phrase the coaching and re-estimate scores.
// `locale` localizes the coaching prose only — the JSON contract stays English.
export async function coach(config, { move, focal, portfolio, userText, locale }) {
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

Return STRICT JSON, no prose outside it:
{"message":"the coaching, plain text",
 "updates":[{"name":"existing activity name","scores":{...},"conf":{...}}],
 "created":[{"name":"new activity","scores":{...},"conf":{...}}]}
updates/created may be empty arrays.`;

  const out = await chatRaw(config, [
    { role: 'system', content: sys },
    { role: 'user', content: `Portfolio:\n${portfolioText}\n\nWhat I said: ${userText || '(start)'}` },
  ], { schema: COACH_SCHEMA });
  return parseModelJson(out);
}
