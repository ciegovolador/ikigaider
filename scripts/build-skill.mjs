// build-skill.mjs — mechanically generate the downloadable Claude Code skill.
//
// "Three doors, one product" only holds if the skill's engine is the SAME source
// as the web's, never a hand-maintained copy. This script COPIES the pure core
// (src/lib/* + src/db/sqlite.js) into ikigaider-skill/engine/*.mjs, rewriting the
// only thing that must change — the relative import suffix `.js` -> `.mjs` and the
// `../lib/` prefix flattened to `./` (everything lands in one engine/ dir). It then
// vendors sql.js's wasm + JS glue (a downloaded zip has no node_modules) and zips
// the whole skill dir into public/ so the site's download button resolves.
//
// The transform is deterministic, so the parity test can re-derive it and assert
// engine/*.mjs === transformSource(src) — the bundle can never silently drift.
//
//   node scripts/build-skill.mjs   -> writes engine/*, vendors wasm, zips to public/

import { readFileSync, writeFileSync, copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const skillDir = resolve(root, 'ikigaider-skill');
const engineDir = resolve(skillDir, 'engine');

// source -> bundled engine module. Order is irrelevant; ESM resolves the graph.
export const ENGINE_FILES = [
  ['src/lib/ikigai.js', 'ikigai.mjs'],
  ['src/lib/policy.js', 'policy.mjs'],
  ['src/lib/assessments.js', 'assessments.mjs'],
  ['src/lib/prompts.js', 'prompts.mjs'],
  ['src/lib/reviews.js', 'reviews.mjs'],
  // The review board: one file per discipline (flattened into engine/). Adding a
  // reviewer = a new file here; the import-suffix transform + parity test cover it.
  ['src/lib/reviews/_define.js', '_define.mjs'],
  ['src/lib/reviews/reality-check.js', 'reality-check.mjs'],
  ['src/lib/reviews/plan-economist-review.js', 'plan-economist-review.mjs'],
  ['src/lib/reviews/plan-craftsman-review.js', 'plan-craftsman-review.mjs'],
  ['src/lib/reviews/plan-psychologist-review.js', 'plan-psychologist-review.mjs'],
  ['src/lib/reviews/plan-anthropologist-review.js', 'plan-anthropologist-review.mjs'],
  ['src/lib/orchestrator.js', 'orchestrator.mjs'],
  ['src/db/sqlite.js', 'sqlite.mjs'],
];

// The ONE allowed difference between source and bundle: relative import specifiers
// get flattened to a sibling `.mjs`. '../lib/ikigai.js' and './ikigai.js' both
// become './ikigai.mjs' (every engine module lives in the same flat engine/ dir).
export function transformSource(src) {
  return src.replace(/(\bfrom\s+)(['"])(\.\.?\/[^'"]+)\2/g, (_m, kw, q, spec) => {
    const flat = basename(spec).replace(/\.js$/, '.mjs');
    return `${kw}${q}./${flat}${q}`;
  });
}

// Copy + transform every engine source into engineDir. Returns the file list so
// callers (and the parity test) can verify. Does NOT vendor wasm or zip.
export function bundleEngine() {
  mkdirSync(engineDir, { recursive: true });
  for (const [srcRel, outName] of ENGINE_FILES) {
    const out = transformSource(readFileSync(resolve(root, srcRel), 'utf8'));
    writeFileSync(resolve(engineDir, outName), out);
  }
  return ENGINE_FILES.map(([, n]) => n);
}

// Vendor sql.js's wasm binary + JS glue so the bundle runs with no node_modules.
function vendorWasm() {
  const dist = resolve(root, 'node_modules/sql.js/dist');
  for (const f of ['sql-wasm.js', 'sql-wasm.wasm']) {
    copyFileSync(resolve(dist, f), resolve(engineDir, f));
  }
}

// Zip the skill dir into public/. Test files stay out of the user's download.
// A missing `zip` binary is a warning, not a failure: the engine is still
// bundled (so the parity test + pretest are unaffected), only the artifact is.
function zipBundle() {
  const out = resolve(root, 'public/ikigaider-skill.zip');
  mkdirSync(resolve(root, 'public'), { recursive: true });
  try {
    rmSync(out, { force: true });
    execFileSync('zip', ['-r', '-q', out, '.', '-x', '*.test.mjs'], { cwd: skillDir });
    return out;
  } catch (e) {
    console.warn(`build:skill — skipped zip (${e.code === 'ENOENT' ? 'no `zip` binary' : e.message}); engine bundled.`);
    return null;
  }
}

function main() {
  const files = bundleEngine();
  vendorWasm();
  const zip = zipBundle();
  console.log(`build:skill — bundled ${files.length} engine modules + vendored wasm`);
  if (zip) console.log(`  -> ${zip}`);
}

// Run only when invoked directly (the parity test imports the helpers instead).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
