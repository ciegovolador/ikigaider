---
name: ikigaider
description: Ikigai life-direction coaching. Use when the user wants to find or refine their ikigai, map activities onto love / good-at / world-needs / paid-for, decide what to pursue, double down on, or drop. Runs an explore/exploit navigator over a portable journey.sqlite — you (the agent) are the model; no API key, no model download.
---

# ikigaider — ikigai navigator in your terminal

ikigaider maps a person's activities onto the four ikigai axes (love, good, world,
paid), scores each, and runs an **explore/exploit** policy that tells them the single
best next move — double down, fix a weak axis, scout something new, or drop a trap.
The math and policy are deterministic and bundled; **you supply the scoring and
coaching prose** by answering the prompts the CLI hands you.

State lives in one portable file, `~/.ikigaider/journey.sqlite` (override with
`--db <path>`). It is the SAME format the web app at ikigaider.com reads, so a
journey moves between terminal and browser freely.

## Requirements
Node >= 18. Everything is vendored — no `npm install`, no network, no key.

## The turn loop

Run every command from this skill's directory. Each prints JSON.

**1. Bootstrap**
```
node cli.mjs init                 # creates the journey if absent
node cli.mjs state                # portfolio, focal activity, decided move
```

**2. Assess — turn what the person says into scored activities**
```
node cli.mjs prompt-assess --text "I'm a backend dev but I love building music tools"
```
This prints `{ messages, schema }`. Read `messages` and produce ONLY a JSON object
matching `schema` (the assessment). Treat it as an **isolated call**: score using
*only* the rubric in those messages and what the person actually said — do not let
earlier conversation inflate the scores. Then pipe your JSON back:
```
echo '<your assessment JSON>' | node cli.mjs append-assessment
```
It validates, clamps, de-dupes by name, persists, and prints the new state (with
`focalId` + the decided `move`). If it reports `"kind":"interview"`, no concrete
activity surfaced — ask the person one more question and assess again.

**3. Coach — phrase the decided move and re-estimate scores**
```
node cli.mjs prompt-coach --focal <focalId> --user-text "what they just told you"
```
Prints `{ messages, schema, move }`. The `move` is already decided by the policy —
**do not override it**; coach toward it. Produce ONLY JSON matching `schema`, again
as an isolated call. Pipe it back, carrying the same focal:
```
echo '<your coach JSON>' | node cli.mjs append-move --focal <focalId> --user-text "..."
```
It prints the coaching `message`, the new `focalId`, and the `nextMove`. Loop step 3
for each subsequent turn, threading the returned `focalId` forward.

**4. Reviews — your multidisciplinary board (make a score earn itself with evidence)**
A *review* is a forcing-questions turn that re-scores ONE axis only, from evidence the
person gives — anti-self-delusion, not coaching. The board (forks gstack's review skills):

| review | axis | mirrors gstack |
|---|---|---|
| `reality-check` | paid | `qa` (quick gut check) |
| `plan-economist-review` | paid | `plan-eng-review` (runway/income) |
| `plan-craftsman-review` | good | `plan-eng-review` (shipped evidence) |
| `plan-psychologist-review` | love | `plan-design-review` (love vs "should") |
| `plan-anthropologist-review` | world | `plan-devex-review` (who actually asked) |

Panels (a chair that convenes specialists — run each member in sequence):
`plan-strategist-review` (`plan-ceo-review`), `plan-mentor-review` (`mentor-review`),
`panel` (`autoplan`, the full board). Run `node cli.mjs ... ` per member, threading the focal.

```
node cli.mjs prompt-review --focal <focalId> --review <name>
```
Prints `{ messages, schema, axis, focalId }`. Produce ONLY JSON matching `schema`
(`{message, scores, conf}`) as an **isolated call** — judge from the person's evidence in
THIS exchange alone, do not flatter. Re-estimate all four axes but change ONLY the reviewed
axis. Pipe it back:
```
echo '<your review JSON>' | node cli.mjs append-review --focal <focalId> --review <name>
```
It re-scores **only** the reviewed axis (the other three are carried forward in code, never
trusted to you), writes the new `scores` row tagged `source=review`, and prints the
`verdict` (downgrade/upgrade/unchanged) + new state. Same one-retry-then-surface contract.
Web parity: typing `/review <axis>` (e.g. `/review love`) in the chat on ikigaider.com runs
the axis's specialist; `/review <name>` runs a specific reviewer.

> Maintainer note: each reviewer records the gstack skill + version it forks. Run
> `npm run reviews:check` to see if gstack has advanced past a mirrored reviewer (free updates).

**5. Visualize**
```
node cli.mjs export
```
Writes a sanitized copy (never carries any API key) and prints its path. Tell the
person to open ikigaider.com and use **Import journey** to see the map and trajectory.

## Rules that keep the doors aligned
- **You are the model.** Never invent a different prompt — always use the messages
  `prompt-assess` / `prompt-coach` give you, verbatim. That is what keeps the terminal
  and the web app scoring the same way.
- **Isolated calls.** Score/coach from the provided messages alone. The harness can't be
  pinned to a fixed temperature and carries session context, so consciously ignore prior
  turns when you score — this is the one known parity gap with the web/BYO door.
- **One retry, then surface.** If `append-assessment` / `append-move` returns an `error`
  with `"retry":true`, fix the listed fields and resend ONCE. If it still fails, tell the
  person plainly — nothing was written.
- **Locale.** Add `--locale es` to `prompt-coach`/`append-move` to coach in Spanish; the
  JSON keys and activity names stay English (the engine contract is English).

## Commands
`init` · `state [--focal <id>]` · `prompt-assess --text <s>` · `append-assessment` (stdin) ·
`prompt-coach --focal <id> [--user-text <s>] [--locale es]` · `append-move --focal <id>` (stdin) ·
`prompt-review --review <name> [--focal <id>]` · `append-review --review <name> [--focal <id>]` (stdin) ·
`export [--out <path>]`. All accept `--db <path>` (default `~/.ikigaider/journey.sqlite`).
