// assessments.js — the "hard data" backend: a research-grounded rubric for
// each axis. Pure data + a prompt builder. The LLM scores an activity against
// these rubrics; the app's math (ikigai.js) and policy (policy.js) take over
// from there.

import { AXES, AXIS_LABEL } from './ikigai.js';

export const RUBRICS = {
  love: {
    domain: 'Psychology — intrinsic motivation & passion',
    instruments: 'Harmonious Passion Scale, Intrinsic Motivation Inventory, flow proneness',
    anchors: {
      0: 'You avoid it; it drains you; pure obligation.',
      0.5: 'Neutral-to-mild interest; you can do it but rarely seek it out.',
      1: 'Autotelic — you lose track of time, seek it unprompted, feel energised after.',
    },
    probes: [
      'When you do this, does time speed up or drag?',
      'Would you still do it if no one watched and no one paid?',
    ],
  },
  good: {
    domain: 'Performance — measured skill & track record',
    instruments: 'Skills inventory, deliberate-practice hours, objective outputs, 360 feedback',
    anchors: {
      0: 'No skill or track record; others outperform you sharply.',
      0.5: 'Competent; roughly average among people who do this.',
      1: 'Top-decile, demonstrable results, sought out for it.',
    },
    probes: [
      'What measurable result proves your level here?',
      'Where do you rank against people who do this seriously?',
    ],
  },
  world: {
    domain: 'Social & technology forecasting — real, durable demand',
    instruments: 'Need indicators, impact frameworks (e.g. SDGs), technology-trend trajectory',
    anchors: {
      0: 'No one needs the outcome; demand is flat or declining.',
      0.5: 'Some real need today; unclear trajectory.',
      1: 'Pressing, growing need; trend lines point up over 3–5 years.',
    },
    probes: [
      'Who is worse off if this does not get done?',
      'Is demand for this rising or falling over the next 3–5 years?',
    ],
  },
  paid: {
    domain: 'Market research & business administration — willingness to pay',
    instruments: 'Labour-market demand, salary benchmarks, business-model viability',
    anchors: {
      0: 'No one pays; no viable model.',
      0.5: 'Modest, inconsistent income possible.',
      1: 'Strong, reliable pay or a proven business model.',
    },
    probes: [
      'Who has actually paid for this, and how much?',
      'What does the market rate or salary benchmark say?',
    ],
  },
};

// Compact rubric text for embedding in the LLM system prompt.
export function rubricText() {
  return AXES.map((a) => {
    const r = RUBRICS[a];
    return `- ${a} (${AXIS_LABEL[a]}) — ${r.domain}. Instruments: ${r.instruments}. ` +
      `0=${r.anchors[0]} 0.5=${r.anchors[0.5]} 1=${r.anchors[1]}`;
  }).join('\n');
}
