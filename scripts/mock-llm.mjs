// Mock OpenAI-compatible server for verifying the ikigaider loop without a
// real model. Branches on the system prompt: "Decided move:" => coach,
// otherwise => assess. Run: node scripts/mock-llm.mjs  (port 8099)
import { createServer } from 'node:http';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const reply = (obj) => JSON.stringify({ choices: [{ message: { content: JSON.stringify(obj) } }] });

createServer((req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const sys = (() => { try { return JSON.parse(body).messages?.[0]?.content || ''; } catch { return ''; } })();
    let out;
    if (sys.includes('you may ONLY change')) {
      // A REVIEW turn: re-score the reviewed axis only. Parse the axis + the
      // current scores out of the prompt and simulate "evidence didn't hold up"
      // by halving the reviewed axis (others carried forward).
      const axis = (sys.match(/\((love|good|world|paid)\)/) || [])[1] || 'paid';
      const cur = {};
      for (const a of ['love', 'good', 'world', 'paid']) {
        const m = sys.match(new RegExp(`${a}\\s+([0-9.]+)`));
        cur[a] = m ? Number(m[1]) : 0.5;
      }
      out = reply({
        message: `No concrete evidence for ${axis} — only intentions. Lowering it.`,
        scores: { ...cur, [axis]: Math.round(cur[axis] * 50) / 100 },
        conf: { love: 0.8, good: 0.8, world: 0.8, paid: 0.8 },
      });
    } else if (sys.includes('Decided move:')) {
      out = reply({
        message: 'Your music tools sit in Passion — you love them and you\'re decent. The weakest axis is pay. Try charging for one tool this month.',
        updates: [{ name: 'music tools', scores: { love: 0.9, good: 0.6, world: 0.5, paid: 0.45 }, conf: { love: 0.9, good: 0.7, world: 0.6, paid: 0.6 } }],
        created: [],
      });
    } else {
      out = reply({
        activities: [
          { name: 'backend at fintech', scores: { love: 0.2, good: 0.85, world: 0.6, paid: 0.9 }, conf: { love: 0.9, good: 0.9, world: 0.7, paid: 0.9 }, note: 'comfortable but empty' },
          { name: 'music tools', scores: { love: 0.9, good: 0.5, world: 0.4, paid: 0.2 }, conf: { love: 0.9, good: 0.6, world: 0.5, paid: 0.6 }, note: 'passion project' },
        ],
      });
    }
    res.writeHead(200, { 'Content-Type': 'application/json', ...CORS });
    res.end(out);
  });
}).listen(8099, () => console.log('mock-llm on http://localhost:8099/v1'));
