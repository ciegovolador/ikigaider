#!/usr/bin/env node
// check-review-updates.mjs — "free updates" for the gstack fork.
//
// Each reviewer/panel records the gstack version it was mirrored against
// (gstackVersion) and which skill it forks (mirrors). When the locally installed
// gstack advances past that, the upstream skill may have improved — this flags
// the reviewers to re-check and re-mirror. It never edits anything; it reports.
//
//   npm run reviews:check

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { reviewUpdates } from '../src/lib/reviews.js';

function installedGstackVersion() {
  for (const p of [
    resolve(homedir(), '.claude/skills/gstack/VERSION'),
    resolve(homedir(), '.gstack/VERSION'),
  ]) {
    try { return readFileSync(p, 'utf8').trim(); } catch { /* try next */ }
  }
  return null;
}

const installed = installedGstackVersion();
if (!installed) {
  console.log('gstack is not installed locally — nothing to compare against. (Reviewers carry their own mirror metadata.)');
  process.exit(0);
}

const behind = reviewUpdates(installed);
if (behind.length === 0) {
  console.log(`All reviewers are current with gstack ${installed}. Nothing to re-mirror.`);
  process.exit(0);
}

console.log(`gstack ${installed} has advanced past these mirrored reviewers — re-read the upstream skill and bump gstackVersion:\n`);
for (const b of behind) {
  console.log(`  ${b.name.padEnd(28)} mirrors ${b.mirrors}  (mirrored at ${b.mirroredAt})`);
}
console.log(`\n${behind.length} reviewer(s) may have free updates upstream.`);
