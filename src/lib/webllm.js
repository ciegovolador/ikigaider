// webllm.js — optional in-browser LLM provider (WebGPU), so the app can coach
// with ZERO setup (no endpoint, no key). Lazy-loaded: the ~14MB engine and the
// model weights are only fetched when the user actually opts in, so they never
// touch the bundle or the network otherwise. Mirrors llm.js's chatRaw contract:
// returns the assistant message content as a string.
//
//   config.base_url = "browser:<model-id>"  ->  this provider
//   anything else                            ->  the fetch path in llm.js
//
// Real inference needs WebGPU (desktop Chrome/Edge). Everywhere else this throws
// a clear error and the UI falls back to BYO endpoint or the offline demo.

// A small, fast, instruction-tuned model that returns JSON reliably enough for
// the assess/coach contract while keeping the one-time download modest (~0.5GB).
export const DEFAULT_BROWSER_MODEL = 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC';

export const BROWSER_MODELS = [
  { id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC', label: 'Qwen2.5 0.5B — fastest, ~350MB' },
  { id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', label: 'Qwen2.5 1.5B — balanced, ~1GB' },
  { id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC', label: 'Llama 3.2 1B — ~0.7GB' },
];

export function webgpuAvailable() {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

export function isBrowserProvider(base) {
  return typeof base === 'string' && base.startsWith('browser:');
}

export function modelFromBase(base) {
  const m = (base || '').replace(/^browser:/, '').trim();
  return m || DEFAULT_BROWSER_MODEL;
}

// Module-level progress listener so the UI can show "Loading model… 42%" without
// threading a callback through every chatRaw call.
let progressCb = null;
export function onLoadProgress(cb) { progressCb = cb; }

let enginePromise = null;
let loadedModel = null;

async function getEngine(model) {
  if (enginePromise && loadedModel === model) return enginePromise;
  loadedModel = model;
  enginePromise = (async () => {
    if (!webgpuAvailable()) {
      throw new Error(
        'This browser has no WebGPU, so it can’t run a local model. Use desktop ' +
        'Chrome or Edge, connect your own endpoint under ⚙, or try the demo.'
      );
    }
    const webllm = await import('@mlc-ai/web-llm');
    return webllm.CreateMLCEngine(model, {
      initProgressCallback: (p) => progressCb?.(p),
    });
  })();
  return enginePromise;
}

export async function browserChat(config, messages, { schema = null, temperature = 0.2 } = {}) {
  const engine = await getEngine(modelFromBase(config.base_url));
  const res = await engine.chat.completions.create({
    messages,
    temperature,
    ...(schema ? { response_format: { type: 'json_object' } } : {}),
  });
  progressCb?.(null); // signal "done loading" once the first response lands
  return res.choices?.[0]?.message?.content ?? '';
}
