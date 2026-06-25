// plan-anthropologist-review — the demand seat (mirrors gstack's plan-devex-review:
// who actually uses this, real behavior not claims). Owns the WORLD axis: counts
// named people and real behavior, never "people would want it".
import { defineReview } from './_define.js';

export default defineReview({
  name: 'plan-anthropologist-review',
  axis: 'world',
  mirrors: 'gstack/plan-devex-review',
  gstackVersion: '1.51.0.0',
  title: 'Anthropologist review',
  voice: 'a demand researcher who counts named people and real behavior, and treats "people would want it" as zero',
  questions: [
    'Who specifically has asked for this — a name and a date, not a category like "small businesses"?',
    'What would they actually DO — pay, switch, complain, show up — if it disappeared tomorrow?',
  ],
});
