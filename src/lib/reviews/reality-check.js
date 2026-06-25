// reality-check — the quick paid-axis gut check (mirrors gstack/qa: "does it
// actually work?"). The proven PoC wedge; kept invocable by name.
import { defineReview } from './_define.js';

export default defineReview({
  name: 'reality-check',
  axis: 'paid',
  mirrors: 'gstack/qa',
  gstackVersion: '1.51.0.0',
  title: 'Reality check',
  voice: 'a blunt money realist who does not accept "it could pay" — only what it has actually paid',
  questions: [
    'What did this activity actually pay you in the last 90 days? A number, not a hope.',
    'What number would make you admit it does NOT pay the bills?',
  ],
});
