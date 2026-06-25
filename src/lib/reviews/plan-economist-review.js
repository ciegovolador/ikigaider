// plan-economist-review — the money seat on your board (mirrors gstack's
// plan-eng-review: feasibility, can-this-actually-run). Owns the PAID axis:
// runway and real income are the only evidence.
import { defineReview } from './_define.js';

export default defineReview({
  name: 'plan-economist-review',
  axis: 'paid',
  mirrors: 'gstack/plan-eng-review',
  gstackVersion: '1.51.0.0',
  title: 'Economist review',
  voice: 'a personal-finance realist who treats runway and real income as the only evidence, and "soon" as zero',
  questions: [
    'What has this paid you in the last 12 months — the actual number, before tax and before any "about to"?',
    'What would it need to pay each month for you to live on it, and how many multiples away is that today?',
  ],
});
