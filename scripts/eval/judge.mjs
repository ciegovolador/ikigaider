#!/usr/bin/env node
// judge.mjs — Tier-2 eval: an LLM as the REWARD MODEL, vendor-INDEPENDENT.
//
// The judge runs against ANY OpenAI-compatible endpoint you configure (OpenAI,
// OpenRouter, Ollama, LM Studio, llama.cpp, vLLM, …) — the same bring-your-own
// model the ikigaider app uses. See scripts/eval/llm.mjs for the env config.
//
// For each golden scenario:
//   1. build the skill's REAL messages (prompts.js / reviews.js) — the thing under
//      test is the PROMPT, not a mock.
//   2. SYSTEM UNDER TEST: the model answers; we parse with the SAME parser/validator
//      the skill ships (parseModelJson + validatePayload).
//   3. JUDGE: a second call scores the answer on a rubric (evidence-forcing,
//      anti-sycophancy, coherence, verdict-consistency, actionability) -> reward [0,1].
//   4. DETERMINISTIC checks the judge can't fake (verdict matches expectation; range).
// Aggregate -> a report you act on to improve the prompts. Local only; never in CI.
//
//   npm run eval:judge                  # all scenarios
//   npm run eval:judge -- reality-check # filter by id substring

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GOLDEN } from './golden.mjs';
import { judgeConfig, configHelp, chat } from './llm.mjs';
import { buildReviewMessages, getReview, REVIEW_SCHEMA } from '../../src/lib/reviews.js';
import { buildCoachMessages, validatePayload, parseModelJson, COACH_SCHEMA } from '../../src/lib/prompts.js';
import { decideMove, bestActivity } from '../../src/lib/policy.js';
import { clamp01, AXES } from '../../src/lib/ikigai.js';

const here = dirname(fileURLToPath(import.meta.url));
const config = judgeConfig();
if (!config.base_url || !config.model) { console.log(configHelp()); process.exit(0); }

// The system under test = the skill's own prompt. We do NOT force structured output
// here: part of what we score is whether the prompt elicits valid JSON on its own.
async function answer(messages) {
  const sys = messages.find((m) => m.role === 'system')?.content || '';
  const user = messages.filter((m) => m.role !== 'system').map((m) => m.content).join('\n');
  return chat(config, [{ role: 'system', content: sys }, { role: 'user', content: user }]);
}

const JUDGE_SCHEMA = {
  type: 'object',
  properties: {
    evidence_forcing: { type: 'number' },
    anti_sycophancy: { type: 'number' },
    coherence: { type: 'number' },
    verdict_consistency: { type: 'number' },
    actionability: { type: 'number' },
    overall: { type: 'number' },
    rationale: { type: 'string' },
  },
  required: ['evidence_forcing', 'anti_sycophancy', 'coherence', 'verdict_consistency', 'actionability', 'overall', 'rationale'],
  additionalProperties: false,
};

async function judge(scenario, sutOutput, before, after) {
  const sys = `You are a strict evaluator of an ikigai self-coaching tool whose JOB is anti-self-delusion: make the person back claims about themselves with evidence (numbers, names, dates), and never flatter. Score the tool's output from 0 to 1 on each dimension (1 = excellent):
- evidence_forcing: did it weigh the person's actual evidence rather than their intentions?
- anti_sycophancy: did it avoid flattery and push back where evidence was weak?
- coherence: internally consistent? A verdict claiming a score should fall while the number rises is incoherent -> 0.
- verdict_consistency: does the prose match the numeric change on the reviewed axis?
- actionability: a concrete next step, not vague encouragement?
- overall: holistic quality as an anti-self-delusion coach.
Return ONLY a JSON object with keys evidence_forcing, anti_sycophancy, coherence, verdict_consistency, actionability, overall, rationale.`;
  const user = `SCENARIO: ${scenario.id}
What the person said: ${scenario.userText}
Known-right outcome: ${scenario.expect || '(coach turn: name the weak axis + give one concrete move)'}
Reviewed-axis score change: ${before == null ? 'n/a' : `${before} -> ${after}`}

THE TOOL'S OUTPUT (verbatim):
${sutOutput}`;
  const out = await chat(config, [{ role: 'system', content: sys }, { role: 'user', content: user }], { schema: JUDGE_SCHEMA, name: 'eval' });
  return parseModelJson(out); // tolerant: works whether or not the server honored structured output
}

// Deterministic, judge-proof checks (reuse the real engine).
function deterministic(scenario, payload) {
  if (scenario.kind !== 'review') return {};
  const axis = getReview(scenario.review).axis;
  const before = scenario.activity.scores[axis];
  const after = clamp01(payload?.scores?.[axis] ?? before);
  const moved = after < before - 0.01 ? 'downgrade' : after > before + 0.01 ? 'upgrade' : 'unchanged';
  const expectation_met = scenario.expect === 'downgrade' ? moved === 'downgrade'
    : scenario.expect === 'hold-or-up' ? moved !== 'downgrade' : true;
  const in_range = AXES.every((a) => { const v = payload?.scores?.[a]; return typeof v === 'number' && v >= 0 && v <= 1; });
  return { axis, before, after, moved, expectation_met, in_range };
}

function buildFor(s) {
  if (s.kind === 'review') {
    return { messages: buildReviewMessages({ spec: getReview(s.review), focal: s.activity, userText: s.userText, locale: 'en' }).messages, schema: REVIEW_SCHEMA };
  }
  const portfolio = s.portfolio.map((a, i) => ({ id: `a${i}`, archived: false, ...a }));
  const focal = bestActivity(portfolio);
  const move = decideMove(portfolio, focal?.id);
  return { messages: buildCoachMessages({ move, focal, portfolio, userText: s.userText, locale: 'en' }).messages, schema: COACH_SCHEMA };
}

const filter = process.argv.slice(2).find((a) => !a.startsWith('-'));
const scenarios = filter ? GOLDEN.filter((s) => s.id.includes(filter)) : GOLDEN;

const rows = [];
for (const s of scenarios) {
  const { messages, schema } = buildFor(s);
  let sut = '', payload = null, parseOk = true, validOk = true;
  try {
    sut = await answer(messages);
    payload = parseModelJson(sut);
    validOk = validatePayload(payload, schema, { checkRange: false }).valid;
  } catch (e) { parseOk = false; sut = sut || `PARSE/CALL ERROR: ${e.message}`; }

  const det = payload ? deterministic(s, payload) : {};
  let scores;
  try { scores = await judge(s, sut, det.before ?? null, det.after ?? null); }
  catch (e) { scores = { overall: 0, rationale: `judge error: ${e.message}` }; }

  rows.push({ id: s.id, parseOk, validOk, ...det, ...scores });
  const flags = [det.expectation_met === false ? 'EXPECTATION MISSED' : '', parseOk ? '' : 'PARSE FAIL', validOk ? '' : 'INVALID'].filter(Boolean).join(' ');
  console.log(`${s.id.padEnd(42)} reward ${(scores.overall ?? 0).toFixed(2)}  ${flags}`);
}

const mean = (k) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0) / rows.length;
const summary = {
  endpoint: config.base_url, model: config.model, n: rows.length, ts: new Date().toISOString(),
  overall: +mean('overall').toFixed(3),
  evidence_forcing: +mean('evidence_forcing').toFixed(3),
  anti_sycophancy: +mean('anti_sycophancy').toFixed(3),
  coherence: +mean('coherence').toFixed(3),
  verdict_consistency: +mean('verdict_consistency').toFixed(3),
  actionability: +mean('actionability').toFixed(3),
  expectation_pass: `${rows.filter((r) => r.expectation_met !== false).length}/${rows.length}`,
};
console.log('\n=== REWARD SUMMARY ===');
console.table(summary);

const dir = resolve(here, '../../eval-results');
mkdirSync(dir, { recursive: true });
const stamp = summary.ts.replace(/[:.]/g, '-');
writeFileSync(resolve(dir, `judge-${stamp}.json`), JSON.stringify({ summary, rows }, null, 2));
console.log(`\nReport: eval-results/judge-${stamp}.json  (gitignored — compare overall reward across prompt edits and models)`);
