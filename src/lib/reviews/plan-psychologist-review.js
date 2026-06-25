// plan-psychologist-review — the meaning seat (mirrors gstack's plan-design-review:
// the human-experience lens). Owns the LOVE axis: genuine intrinsic love vs an
// inherited "should" or sunk cost.
import { defineReview } from './_define.js';

export default defineReview({
  name: 'plan-psychologist-review',
  axis: 'love',
  mirrors: 'gstack/plan-design-review',
  gstackVersion: '1.51.0.0',
  title: 'Psychologist review',
  voice: 'a psychologist who separates real intrinsic love from inherited "shoulds", status, and sunk cost',
  questions: [
    'Name the last specific time you lost track of hours doing this. When exactly — a real day?',
    'If no one would ever know or reward you for it, would you still do it this week? Why?',
  ],
});
