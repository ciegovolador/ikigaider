#!/usr/bin/env node
// cli.mjs — the ONLY process the ikigaider skill shells out to. It never calls a
// model: the harness agent IS the model. The flow is two halves of the shared
// orchestrator, driven by the agent:
//
//   prompt-assess  -> agent reads the exact prompts.js messages, returns assess JSON
//   append-assessment (stdin) -> validate + applyPayload + persist
//   prompt-coach   -> agent reads the coach messages + decided move, returns coach JSON
//   append-move (stdin)       -> validate + runTurn(injected coach) + persist
//   state / init / export     -> read, bootstrap, hand off to the web visualizer
//
// Because prompt-* emit the IDENTICAL messages the web sends (buildAssess/Coach
// from prompts.js) and append-* run the IDENTICAL orchestrator, the Claude Code
// door and the web door cannot drift. Every write is schema-validated; invalid
// agent JSON is surfaced for ONE retry and NOTHING is written (never silent).

import { openDb, writeDb, DEFAULT_DB } from './db.mjs';
import { ikigaiScore, bottleneckAxis, classify } from './engine/ikigai.mjs';
import { decideMove, bestActivity } from './engine/policy.mjs';
import { applyPayload, runTurn, runReview } from './engine/orchestrator.mjs';
import {
  buildAssessMessages, buildCoachMessages, validatePayload,
  ASSESS_SCHEMA, COACH_SCHEMA,
} from './engine/prompts.mjs';
import { buildReviewMessages, getReview, REVIEW_SCHEMA } from './engine/reviews.mjs';

// --- tiny arg/io helpers ---------------------------------------------------
function parseArgs(argv) {
  const flags = {};
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) flags[a.slice(2)] = argv[i + 1]?.startsWith('--') || i + 1 >= argv.length ? true : argv[++i];
    else pos.push(a);
  }
  return { cmd: pos[0], flags };
}

const ok = (obj) => { process.stdout.write(JSON.stringify(obj, null, 2) + '\n'); };
// Structured error to stderr, exit 1 — no stack trace leaks to the agent.
const fail = (message, extra = {}) => { process.stderr.write(JSON.stringify({ error: message, ...extra }, null, 2) + '\n'); process.exit(1); };

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8').trim();
}

function parseStdinJson(text) {
  if (!text) throw new Error('expected JSON on stdin, got nothing');
  try { return JSON.parse(text); } catch (e) { throw new Error(`stdin is not valid JSON: ${e.message}`); }
}

// --- shaping ---------------------------------------------------------------
// A decorated portfolio view: each activity with its ikigai score + 16-state.
function shapePortfolio(store) {
  return store.listActivities().filter((a) => !a.archived).map((a) => ({
    id: a.id, name: a.name, scores: a.scores, conf: a.conf,
    ikigai: ikigaiScore(a.scores), state: classify(a.scores).name,
  }));
}

// Resolve the focal: an explicit --focal id if it still exists, else the UCB
// leader (how ingest picks the first focal). null on an empty portfolio.
function resolveFocal(portfolio, wanted) {
  if (wanted && portfolio.some((a) => a.id === wanted)) return wanted;
  return bestActivity(portfolio)?.id ?? null;
}

function stateView(store, wantedFocal) {
  const portfolio = shapePortfolio(store);
  const focalId = resolveFocal(portfolio, wantedFocal);
  const focal = portfolio.find((a) => a.id === focalId) || null;
  return {
    userVersion: store.userVersion(),
    focalId,
    focal: focal ? { ...classify(focal.scores), bottleneck: bottleneckAxis(focal.scores) } : null,
    move: portfolio.length ? decideMove(portfolio, focalId) : null,
    trajectory: focalId ? store.scoresFor(focalId) : [],
    portfolio,
  };
}

// Validate agent JSON; on failure surface the errors for ONE retry and write
// nothing. checkRange:false — makeScores clamps the range, so an off-by-a-bit
// score retries on STRUCTURE only, not on a 1.02 that we'd clamp anyway.
function validateOrFail(payload, schema, kind) {
  const { valid, errors } = validatePayload(payload, schema, { checkRange: false });
  if (!valid) {
    fail(`${kind} JSON failed schema validation — nothing was written. Fix the listed fields and retry ONCE.`, { errors, retry: true });
  }
}

// --- commands --------------------------------------------------------------
async function cmdInit(db) {
  const store = await openDb(db);
  writeDb(store, db);
  ok({ db, userVersion: store.userVersion(), created: true });
}

async function cmdState(db, focal) {
  const store = await openDb(db);
  ok({ db, ...stateView(store, focal) });
}

async function cmdPromptAssess(db, text) {
  if (!text || text === true) fail('prompt-assess needs --text "<what the person said>"');
  ok(buildAssessMessages(text));
}

async function cmdAppendAssessment(db) {
  const payload = parseStdinJson(await readStdin());
  validateOrFail(payload, ASSESS_SCHEMA, 'assessment');
  const store = await openDb(db);
  const createdIds = applyPayload(store, payload);
  writeDb(store, db);
  const view = stateView(store);
  ok({ db, createdIds, kind: view.portfolio.length ? 'placed' : 'interview', ...view });
}

async function cmdPromptCoach(db, { focal, userText, locale }) {
  const store = await openDb(db);
  const portfolio = shapePortfolio(store);
  if (!portfolio.length) fail('prompt-coach needs a non-empty portfolio — run prompt-assess + append-assessment first');
  const focalId = resolveFocal(portfolio, focal);
  const move = decideMove(portfolio, focalId);
  const focalAct = portfolio.find((a) => a.id === focalId) || null;
  ok({ ...buildCoachMessages({ move, focal: focalAct, portfolio, userText: userText === true ? '' : (userText || ''), locale: locale === true ? 'en' : (locale || 'en') }), move, focalId });
}

async function cmdAppendMove(db, { focal, userText, locale }) {
  const payload = parseStdinJson(await readStdin());
  validateOrFail(payload, COACH_SCHEMA, 'coach');
  const store = await openDb(db);
  const portfolio = shapePortfolio(store);
  if (!portfolio.length) fail('append-move needs a non-empty portfolio');
  const prevFocalId = resolveFocal(portfolio, focal);
  const executeMove = decideMove(portfolio, prevFocalId);
  // Inject the agent's coach JSON as the model-caller — same orchestrator path
  // the web runs, only the caller differs ("three doors, one product").
  const coach = async () => payload;
  const turn = await runTurn(store, coach, {
    config: {}, userText: userText === true ? '' : (userText || ''),
    executeMove, prevFocalId, locale: locale === true ? 'en' : (locale || 'en'),
  });
  store.addMove(turn.executedMove); // decision log for the web visualizer trajectory
  writeDb(store, db);
  ok({ db, message: turn.message, focalId: turn.focalId, glide: turn.glide, createdIds: turn.createdIds, nextMove: turn.nextMove, portfolio: turn.portfolio });
}

// prompt-review: emit the forcing-questions messages for the agent (mirror of
// prompt-coach). The agent answers with REVIEW_SCHEMA JSON; append-review applies it.
async function cmdPromptReview(db, { focal, review }) {
  if (!review || review === true) fail('prompt-review needs --review <name> (e.g. reality-check)');
  const spec = getReview(review);
  if (!spec) fail(`unknown review "${review}". Try: reality-check`);
  const store = await openDb(db);
  const portfolio = shapePortfolio(store);
  if (!portfolio.length) fail('prompt-review needs a non-empty portfolio — assess an activity first');
  const focalId = resolveFocal(portfolio, focal);
  const focalAct = store.listActivities().find((a) => a.id === focalId);
  ok({ ...buildReviewMessages({ spec, focal: focalAct, userText: '', locale: 'en' }), review: spec.name, axis: spec.axis, focalId });
}

// append-review: validate the agent's review JSON, re-score ONLY the reviewed axis
// (carry-forward enforced in runReview), persist with source='review'. Same
// retry-once-then-write-nothing contract as append-move.
async function cmdAppendReview(db, { focal, review, locale }) {
  const spec = getReview(review === true ? '' : review);
  if (!spec) fail('append-review needs --review <name> (e.g. reality-check)');
  const payload = parseStdinJson(await readStdin());
  validateOrFail(payload, REVIEW_SCHEMA, 'review');
  const store = await openDb(db);
  const portfolio = shapePortfolio(store);
  if (!portfolio.length) fail('append-review needs a non-empty portfolio');
  const focalId = resolveFocal(portfolio, focal);
  const reviewer = async () => payload;
  const r = await runReview(store, reviewer, { config: {}, focalId, spec, locale: locale === true ? 'en' : (locale || 'en') });
  writeDb(store, db);
  ok({ db, message: r.message, axis: r.axis, before: r.before, after: r.after, verdict: r.verdict, ...stateView(store, r.focalId) });
}

async function cmdExport(db, out) {
  const store = await openDb(db);
  const target = out && out !== true ? out : db;
  writeDb(store, target, { sanitized: true }); // never let an api_key travel
  ok({ exported: target, note: 'Import this .sqlite on ikigaider.com to visualize the journey.' });
}

// --- dispatch --------------------------------------------------------------
async function main() {
  const { cmd, flags } = parseArgs(process.argv.slice(2));
  const db = flags.db && flags.db !== true ? flags.db : DEFAULT_DB;
  switch (cmd) {
    case 'init': return cmdInit(db);
    case 'state': return cmdState(db, flags.focal);
    case 'prompt-assess': return cmdPromptAssess(db, flags.text);
    case 'append-assessment': return cmdAppendAssessment(db);
    case 'prompt-coach': return cmdPromptCoach(db, { focal: flags.focal, userText: flags['user-text'], locale: flags.locale });
    case 'append-move': return cmdAppendMove(db, { focal: flags.focal, userText: flags['user-text'], locale: flags.locale });
    case 'prompt-review': return cmdPromptReview(db, { focal: flags.focal, review: flags.review });
    case 'append-review': return cmdAppendReview(db, { focal: flags.focal, review: flags.review, locale: flags.locale });
    case 'export': return cmdExport(db, flags.out);
    default:
      return fail(`Unknown command "${cmd ?? ''}". Use: init | state | prompt-assess | append-assessment | prompt-coach | append-move | prompt-review | append-review | export`);
  }
}

main().catch((e) => fail(e.message));
