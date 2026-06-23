// webllm.js — optional in-browser LLM provider (WebGPU), so the app can coach
// with ZERO setup (no endpoint, no key). Lazy-loaded: the ~14MB engine and the
// model weights are only fetched when the user actually opts in, so they never
// touch the bundle or the network otherwise. Mirrors llm.js's chatRaw contract:
// returns the assistant message content as a string.
//
//   config.base_url = "browser:<model-id>"  ->  this provider
//   anything else                            ->  the fetch path in llm.js
//
// WebGPU (desktop Chrome/Edge) gives fast inference via WebLLM. Browsers without
// WebGPU fall back to wllama — llama.cpp compiled to WASM — which runs a small
// model on the CPU. Slower, but it works everywhere. Both honour the same string
// contract, so the rest of the app never knows which engine answered.

// A small, fast, instruction-tuned model that returns JSON reliably enough for
// the assess/coach contract while keeping the one-time download modest (~0.5GB).
export const DEFAULT_BROWSER_MODEL = 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC';

// Config base that selects the in-browser engine with the default model. Used as
// the app's DEFAULT config so a fresh user can coach with zero setup.
export const DEFAULT_BROWSER_BASE = `browser:${DEFAULT_BROWSER_MODEL}`;

export const BROWSER_MODELS = [
  { id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC', label: 'Qwen2.5 0.5B — fastest, ~350MB' },
  { id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', label: 'Qwen2.5 1.5B — balanced, ~1GB' },
  { id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC', label: 'Llama 3.2 1B — ~0.7GB' },
];

// CPU fallback model (no WebGPU): a small GGUF wllama loads from Hugging Face and
// runs on CPU. Kept to the 0.5B class so CPU stays usable — the user's MLC model
// choice above is only honoured on the WebGPU path.
const FALLBACK_GGUF = { repo: 'bartowski/Qwen2.5-0.5B-Instruct-GGUF', file: 'Qwen2.5-0.5B-Instruct-Q4_K_M.gguf' };

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

// --- WebGPU path: WebLLM ----------------------------------------------------
let enginePromise = null;
let loadedModel = null;
// `navigator.gpu` can exist without a usable adapter (headless browsers, a
// disabled/blocklisted GPU, partial Firefox support). Once WebLLM init proves
// that, we latch this and route to the CPU engine for the rest of the session
// instead of retrying — and failing — the GPU path every turn.
let gpuBroken = false;

async function getEngine(model) {
  if (enginePromise && loadedModel === model) return enginePromise;
  loadedModel = model;
  enginePromise = (async () => {
    const webllm = await import('@mlc-ai/web-llm');
    return webllm.CreateMLCEngine(model, {
      initProgressCallback: (p) => progressCb?.(p),
    });
  })();
  return enginePromise;
}

// --- CPU fallback path: wllama (llama.cpp WASM) -----------------------------
// One instance for the process. The JS engine + the wasm URL are dynamically
// imported so nothing loads until a WebGPU-less browser actually needs them.
let wllamaPromise = null;

async function getWllama() {
  if (wllamaPromise) return wllamaPromise;
  wllamaPromise = (async () => {
    const [{ Wllama }, wasmMod] = await Promise.all([
      import('@wllama/wllama'),
      import('@wllama/wllama/esm/wasm/wllama.wasm?url'),
    ]);
    const wllama = new Wllama({ default: wasmMod.default });
    await wllama.loadModelFromHF(FALLBACK_GGUF, {
      n_ctx: 4096,
      // wllama reports bytes; project onto the same {progress} shape WebLLM uses.
      progressCallback: ({ loaded, total }) =>
        progressCb?.({ progress: total ? loaded / total : 0, text: 'Loading CPU model…' }),
    });
    return wllama;
  })();
  return wllamaPromise;
}

export async function browserChat(config, messages, { schema = null, temperature = 0.2 } = {}) {
  if (webgpuAvailable() && !gpuBroken) {
    let engine = null;
    try {
      engine = await getEngine(modelFromBase(config.base_url));
    } catch {
      // Engine INIT failed despite navigator.gpu — the GPU isn't really usable.
      // Latch it and drop to the CPU engine below. (A failure DURING completion,
      // by contrast, surfaces normally — that's not a GPU-availability problem.)
      gpuBroken = true;
      enginePromise = null;
      loadedModel = null;
      progressCb?.(null);
    }
    if (engine) {
      const res = await engine.chat.completions.create({
        messages,
        temperature,
        ...(schema ? { response_format: { type: 'json_object' } } : {}),
      });
      progressCb?.(null); // signal "done loading" once the first response lands
      return res.choices?.[0]?.message?.content ?? '';
    }
  }
  // No WebGPU → run the small GGUF on CPU. Slower, same return contract. The MLC
  // model id in config.base_url is ignored here (see FALLBACK_GGUF).
  const wllama = await getWllama();
  const res = await wllama.createChatCompletion({ messages, temperature, max_tokens: 1024 });
  progressCb?.(null);
  return res.choices?.[0]?.message?.content ?? '';
}
