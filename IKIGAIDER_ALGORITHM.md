# The ikigaider algorithm

ikigaider treats the ikigai diagram as **terrain you navigate**, not a static
chart. The "skill" is this algorithm; the app (`src/`) is one surface on top of
it. It is LLM-agnostic: any OpenAI-compatible model can drive it.

## 1. Axes and the ikigai score

An *activity* is scored on four axes, each in `[0,1]`:

| axis  | meaning                | research-backed assessment (see `src/lib/assessments.js`) |
|-------|------------------------|-----------------------------------------------------------|
| love  | what you love          | psychology — intrinsic-motivation / passion psychometrics, flow |
| good  | what you're good at    | performance scores — skills inventory, track record, 360 |
| world | what the world needs   | social & technology forecasting — need indicators, trend trajectory |
| paid  | what you can be paid for | market research & business admin — labour demand, salary benchmarks |

The centre of the Venn is the **intersection** of all four circles, so the
ikigai score is the **product**:

```
I = love · good · world · paid
```

`I` peaks at 1 only when all four are high; any axis near 0 collapses it.

## 2. The gradient = "fix your weakest axis"

The partial derivative of `I` for an axis is the **product of the other three**:

```
∂I/∂love = good · world · paid   (and symmetrically)
```

Excluding the smallest factor leaves the largest product, so the **lowest-scoring
axis has the largest gradient component**. Gradient ascent on `I` automatically
pushes hardest on your bottleneck. Real calculus, demoable conclusion.

## 3. The 16 explicit states

The state is the membership pattern over `{love, good, world, paid}` at threshold
`τ = 0.5` — the full power set, 16 states (`src/lib/ikigai.js`):

- **center** `1111` IKIGAI
- **triples** (rim failure zones, each missing one axis):
  `1110` happy, no wealth · `1101` useless but satisfied ·
  `1011` excited but uncertain · `0111` comfortable but empty
- **named pairs**: `1100` Passion · `1010` Mission · `0101` Profession · `0011` Vocation
- **unnamed pairs**: `1001` Indulgence · `0110` Duty
- **singles**: Daydream · Idle Skill · Charity Gap · Paycheck
- **none** `0000` Lost

The state names the *felt experience* and the missing axis, so a position on the
map is legible, not just a coordinate.

## 4. Position, and why the dot teleports

`project(scores)` maps the 4-axis vector to 2D: love=top, paid=bottom,
good=left, world=right. The dot's position is the **focal activity's** scores.

- **Changing focal activity = a discrete jump** (teleport). Your ikigai is a
  *specific activity* and it is unknown up front, so switching which activity you
  pursue moves you to a different place on the map.
- **Improving the same activity = a continuous glide** along the gradient.

The projection is lossy (it only shows good↔world and love↔paid balance); the
exact `I` and gradient are the source of truth.

## 5. Explore / exploit (the navigator)

Because the target activity is unknown, ikigaider runs a portfolio search
(`src/lib/policy.js`), balancing discovery against optimisation. Each activity
carries a belief: mean scores `μ` and per-axis confidence (`σ ≈ 1 − conf`).
Acquisition is UCB: `score = I(μ) + κ·uncertainty`.

**EXPLORE** (teleport; magnitude = jump length):
- **adjacent** — a small variation of the leading activity, to refine an
  uncertain read.
- **radical** — a clearly different activity, when there's too little to compare.

**EXPLOIT** (partial gradient on the focal activity = direction + length):
- **keep doing** — null step; it already sits near centre, protect it.
- **improve** — positive step on the weakest axis (the gradient bottleneck).
- **stop doing** — negative step; quit a pure self/money trap (Profession /
  Paycheck / Idle Skill with low love and no world-need) to reclaim its
  opportunity cost.

Each turn the policy picks one move and explains *why* (uncertainty vs
confidence, bottleneck axis, opportunity cost); the LLM only phrases the coaching
and re-estimates scores — it cannot override the decided move.

## 6. Persistence

The whole journey lives in a portable SQLite file (`src/db/sqlite.js`, sql.js
WASM): `config`, `activities`, `scores` (history → trajectory), `moves`
(decision log; a focal change here is a teleport). Export it, plug it back in on
any machine. The file is the source of truth — no hidden server state.
