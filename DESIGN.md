# ikigaider — design system

A navigation instrument, not a dashboard. Dark canvas, one warm accent, the ikigai map
as a **navigable** hero you fly toward. The map is the product's face and its primary
surface; the chat is the primary input. Approved direction: **A5-FINAL** (mock at
`~/.gstack/projects/ikigaider/designs/experience-rethink-20260619/`).

## Doctrine — every component fills multiple roles

The acceptance bar for any UI element. Collapse chrome; overload meaning.

| Surface | Roles |
|---|---|
| Map | visualization · input (click=place, drag dot=aim) · navigation (vector + reticle) · progress (center glow ∝ `I`) |
| You-are-here dot | current state · draggable target-setter · trajectory anchor · uncertainty (halo r ∝ σ) |
| Axis instrument | per-axis scores · bottleneck alarm (amber `◂`) · explains `gradient()` |
| Center glow | the IKIGAI target · live progress meter |
| Chat composer | onboarding · re-scoring · conversation · the "place" action |
| Coach message | rationale · move badge · assignment · next-turn trigger |
| Instrument strip | `I` · state (`classify`) · bottleneck · last-move delta |

## Typography

- **Display / brand / map labels:** Space Grotesk Variable (`$font-display`).
- **Body / UI:** Figtree Variable (`$font-body`).
- **Instrument numerals + axis cluster only:** JetBrains Mono Variable (`$font-mono`) — the
  "flight instrument" voice. Never a body face.
- No `system-ui` as a primary face. All three self-hosted via `@fontsource-variable/*`.

## Color (`src/styles/_variables.scss`)

| Token | Hex | Use |
|-------|-----|-----|
| `$c-love` | `#f2a93b` | love (top) — also the global accent |
| `$c-good` | `#7b92d6` | good at (left) |
| `$c-world` | `#62cb8c` | world needs (right) |
| `$c-paid` | `#ec7681` | paid for (bottom) |
| `$bg` | `#101016` | app background (radial wash) |
| `$panel` / `$panel-2` | `#16161f` / `#1f1f2b` | surfaces |
| `$ink` / `$ink-dim` / `$ink-mute` | `#eef0f6` / `#9aa0b0` / `#6c7080` | text tiers |
| `$accent` | `#f2a93b` | primary actions, focal dot, bottleneck |

One accent only. Circles use `mix-blend-mode: screen` with **light fills (~0.2) + crisp
colored strokes (~0.6)** — crisp regions, not the old muddy wash.

## The map (`src/components/IkigaiMap.jsx`, `_map.scss`)

- **Bright center target:** a radial glow (`#ikigai-glow`) scaled by `ikigaiScore` + faint
  reticle rings. IKIGAI reads as the destination and the progress meter.
- **Named intersections** carry a pair label + `love ∩ good` subtitle, set in the gaps off
  the fills. Every label gets the dark-halo `paint-order` treatment.
- **Navigation overlay:** dotted trajectory, a `gradient-vec` arrow pointing at the weakest
  axis, the draggable focal dot (dashed ring), uncertainty halo.
- **Viz-as-input:** hover → ghost crosshair + "click to place"; click → `onPlace` seeds the
  composer; drag the dot → `onAim`. The projection is lossy (stated in `aria-label`); the
  chat resolves exact scores. The map is never the only input (composer mirrors it) for a11y.
- **No gauges on the circle** — axis scores live once, in the instrument cluster.

## Axis instrument (`src/components/AxisInstrument.jsx`)

Discreet, borderless, monospaced cluster docked bottom-**right** of the map. Four thin (3px)
ticked tracks `LOVE/GOOD/WRLD/PAID`, mono values, bottleneck row amber + `◂` + footer
`weakest axis caps I · gradient → <axis>`. Bottleneck is not colour-only (marker + text).

## Layout

- Desktop: `1fr / 408px` shell — left `mapwrap` (brand + map + instrument + tip), right
  `rail` (instrument strip + dominant coach).
- **< 760px:** single column; map full-width, instrument + tip + strip + chat stacked; the
  instrument de-overlays to static under the map; composer reachable.

## Components & patterns

- **Instrument strip:** big mono `I`, 16-state label, bottleneck, `▲/▼` delta, `⚙`.
- **Coach:** scrolling thread (coach/you bubbles, inline move badge) + a large composer with
  `try the demo` and `＋ or click the map` chips. Enter sends; Shift+Enter newlines.
- **Move badge:** pill, `explore` = blue tint, `exploit` = green tint.
- **Config:** BYO-LLM + import/export live in a `⚙` popover (dimmed overlay), hidden by
  default — config is the quietest thing in the app.

## Accessibility

- `:focus-visible` → 2px accent ring. Map `role="img"` + descriptive `aria-label`; clickable
  map has an equivalent text path (the composer). Touch targets ≥ 42px. Bottleneck signalled
  by marker + text, not colour alone. Mono instrument values meet AA on panel.

## States

Loading (`I —`), cold start (dimmed Venn + reticle inviting a click, one coach prompt + demo
chip, no config), error (`error-banner`), populated (glow, dot, vector, trajectory,
instrument), "thinking…". A map click or empty input is the start of a conversation, not an
error.
