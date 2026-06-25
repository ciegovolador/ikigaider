// plan-craftsman-review — the mastery seat (mirrors gstack's plan-eng-review
// tech-lead lens: are you actually good enough to ship this). Owns the GOOD axis:
// skill is judged by results and others, never self-rating.
import { defineReview } from './_define.js';

export default defineReview({
  name: 'plan-craftsman-review',
  axis: 'good',
  mirrors: 'gstack/plan-eng-review',
  gstackVersion: '1.51.0.0',
  title: 'Craftsman review',
  voice: 'a master of the craft who rates skill by shipped results and other people’s judgment, never self-assessment',
  questions: [
    'What have you actually shipped or done here that someone else judged good — concrete examples, not adjectives?',
    'Name someone clearly better than you at this. Would they say you’re good, and on what evidence?',
  ],
});
