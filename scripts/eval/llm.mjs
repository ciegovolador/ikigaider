// llm.mjs — vendor-INDEPENDENT LLM caller for the eval. Speaks the OpenAI-compatible
// /chat/completions contract that OpenAI, OpenRouter, Ollama, LM Studio, llama.cpp,
// vLLM, Together, Groq, Mistral, DeepSeek, and Anthropic's compat endpoint all share —
// the SAME "bring your own endpoint" model the ikigaider app itself uses (src/lib/llm.js).
// No SDK, no vendor lock, native fetch only (Node >= 18). Configure via env:
//   LLM_BASE_URL  e.g. https://api.openai.com/v1 | https://openrouter.ai/api/v1 |
//                      http://localhost:11434/v1 (Ollama) | http://localhost:1234/v1 (LM Studio)
//   LLM_MODEL     e.g. gpt-4o | anthropic/claude-opus-4-8 (OpenRouter) | qwen2.5 | llama3.1
//   LLM_API_KEY   optional (local servers usually need none)

const env = (k) => (process.env[k] || '').trim();

export function judgeConfig() {
  return { base_url: env('LLM_BASE_URL'), model: env('LLM_MODEL'), api_key: env('LLM_API_KEY') };
}

export function configHelp() {
  return `This eval is vendor-independent — point it at any OpenAI-compatible endpoint:

  # OpenAI
  export LLM_BASE_URL=https://api.openai.com/v1    LLM_MODEL=gpt-4o                       LLM_API_KEY=sk-...
  # OpenRouter (Claude / GPT / Gemini / Llama behind one key)
  export LLM_BASE_URL=https://openrouter.ai/api/v1 LLM_MODEL=anthropic/claude-opus-4-8    LLM_API_KEY=sk-or-...
  # Ollama (local, free, no key)
  export LLM_BASE_URL=http://localhost:11434/v1    LLM_MODEL=llama3.1
  # LM Studio (local, free, no key)
  export LLM_BASE_URL=http://localhost:1234/v1     LLM_MODEL=<loaded-model>

Then:  npm run eval:judge`;
}

// Build the chat-completions URL tolerantly (mirrors src/lib/llm.js completionsUrl):
// accept a bare host, a /v1 base, or a full .../chat/completions URL.
function completionsUrl(base) {
  const b = (base || '').trim().replace(/\/+$/, '');
  if (!b) return '';
  if (/\/chat\/completions$/.test(b)) return b;
  if (/\/v\d+$/.test(b)) return `${b}/chat/completions`;
  return `${b}/v1/chat/completions`;
}

// One chat call. `schema` (a JSON schema) requests structured output when the server
// supports it, and silently falls back to prompt-only on a 400 — the same posture as
// the app's chatRaw, so a server that can't do json_schema (many local ones) still works.
export async function chat(config, messages, { schema = null, name = 'output' } = {}) {
  const url = completionsUrl(config.base_url);
  if (!url) throw new Error('LLM_BASE_URL is not set');
  const headers = { 'Content-Type': 'application/json', ...(config.api_key ? { Authorization: `Bearer ${config.api_key}` } : {}) };
  const base = { model: config.model, messages };
  const structured = schema
    ? { ...base, response_format: { type: 'json_schema', json_schema: { name, strict: true, schema } } }
    : base;

  const post = (body) => fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  let res = await post(structured);
  if (!res.ok && schema && res.status === 400) {
    const t = await res.text().catch(() => '');
    if (/response_format|json_schema|schema|json/i.test(t)) res = await post(base); // no structured-output support -> prompt-only
  }
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`${config.model} @ ${url} returned ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content ?? '';
  if (!content) throw new Error('LLM returned empty content (is a model loaded / the name correct?)');
  return content;
}
