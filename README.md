# ikigaider

Navigate to your ikigai. The classic ikigai Venn — *what you love*, *what you're
good at*, *what the world needs*, *what you can be paid for* — treated as
**terrain you navigate**, not a static chart.

An LLM-powered app whose engine is a real algorithm: it scores your activities on
the four axes, places a "you are here" dot, computes the product-gradient that
points at your weakest dimension, and runs an **explore/exploit** search toward
the centre (your ikigai *activity* is unknown, so it must both discover and
optimise). The full algorithm is documented in [`IKIGAIDER_ALGORITHM.md`](./IKIGAIDER_ALGORITHM.md).

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 30 unit tests (math, policy, persistence, json)
```

## Use

1. **Bring your own LLM** — set an OpenAI-compatible Base URL + model (local
   llama.cpp, a hosted endpoint, or a proxy). No vendor lock, no server.
2. Describe where you are now → **Assess & place me**.
3. The coach navigates you with explicit explore/exploit moves; the dot
   **teleports** when you switch activities and **glides** when you improve one.
4. **Export / import** your journey as a portable `.sqlite` file anytime.

No LLM handy? Click **load the demo journey** (or `node scripts/seed-demo.mjs`
to regenerate `public/demo.sqlite`).

## Shape

- `src/lib/ikigai.js` — product score, gradient, 16-state classifier, projection
- `src/lib/policy.js` — UCB explore/exploit; adjacent/radical, keep/improve/stop
- `src/lib/assessments.js` — research-backed rubric per axis
- `src/lib/llm.js` — OpenAI-compatible client + JSON contract
- `src/db/sqlite.js` (+ `sqlite-browser.js`) — portable SQLite via sql.js
- `src/components/*` — SVG map, math panel, coach chat, config, onboarding

Built with Vite + React + JavaScript + SCSS. SOLID / KISS / YAGNI.
