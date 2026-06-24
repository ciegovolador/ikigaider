// llm.js — bring-your-own-LLM transport (OpenAI-compatible /chat/completions).
// The model CONTRACT (system briefs, schemas, message builders, parse) lives in
// prompts.js so every front door (web, skill, MCP) shares it. This file is ONLY
// the transport + thin assess/coach wrappers: feed a builder's messages to the
// model, return the parsed JSON. The math (ikigai.js) and the move decision
// (policy.js) live elsewhere; the LLM only estimates scores and phrases coaching.

import { isBrowserProvider, browserChat, DEFAULT_BROWSER_BASE } from './webllm.js';
import {
  buildAssessMessages,
  buildCoachMessages,
  parseModelJson,
  extractJson,
} from './prompts.js';

// Re-export so existing importers (and llm.test.js) keep resolving extractJson here.
export { extractJson };

// When a BYO endpoint is unreachable we quietly fall back to the in-browser
// model rather than dead-end the user. The UI subscribes here to show a gentle,
// localized note ("couldn't reach your endpoint, using the local model"). The
// arg is the endpoint we couldn't reach.
let onFallbackCb = null;
export function onProviderFallback(cb) { onFallbackCb = cb; }

// Build the chat-completions URL tolerantly: accept a bare host
// (http://127.0.0.1:1234), a /v1 base, or a full .../chat/completions URL.
export function completionsUrl(base) {
  const b = (base || '').trim().replace(/\/+$/, '');
  if (!b) return '';
  if (/\/chat\/completions$/.test(b)) return b;
  if (/\/v\d+$/.test(b)) return `${b}/chat/completions`;
  return `${b}/v1/chat/completions`;
}

// Turn an HTTP status into one actionable line — what the user should change,
// not just the number. The raw status + body still follow for debugging.
function httpHint(status) {
  if (status === 401 || status === 403) return 'The API key was rejected. Check it in ⚙ — or clear it if your local server needs none.';
  if (status === 404) return 'Endpoint not found. Check the Base URL (does it need a /v1 suffix?) and the model name.';
  if (status === 429) return 'Rate limited. Wait a moment, then try again.';
  if (status >= 500) return 'The server hit an error. Check its logs — the model may not be loaded.';
  return 'Check the Base URL, the model name, and that a model is loaded.';
}

// A non-OK response, phrased as: the hint (what to fix), then the raw status and
// a trimmed body for anyone debugging.
function httpError(res, body) {
  const detail = (body || '').trim().slice(0, 200);
  return `Your LLM returned ${res.status} ${res.statusText}.\n${httpHint(res.status)}` +
    (detail ? `\n\nServer said: ${detail}` : '');
}

export async function chatRaw(config, messages, { temperature = 0.2, schema = null } = {}) {
  // In-browser provider (WebGPU): no endpoint, no key. Same return contract.
  if (isBrowserProvider(config.base_url)) {
    return browserChat(config, messages, { temperature, schema });
  }
  const url = completionsUrl(config.base_url);
  if (!url) {
    throw new Error('No Base URL set. Open config and enter your endpoint, e.g. http://localhost:1234 for LM Studio.');
  }
  const headers = {
    'Content-Type': 'application/json',
    ...(config.api_key ? { Authorization: `Bearer ${config.api_key}` } : {}),
  };
  const base = { model: config.model || 'local', temperature, messages };
  const structured = schema
    ? { ...base, response_format: { type: 'json_schema', json_schema: { name: schema.name, strict: true, schema: schema.schema } } }
    : base;

  const post = async (payload) => {
    try {
      return await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
    } catch {
      // Browser fetch throws a TypeError for network failures AND blocked CORS,
      // with a browser-specific message ("Failed to fetch" / "NetworkError…")
      // that tells the user nothing — so we name the two real causes instead.
      // Tagged UNREACHABLE so assess/coach can auto-fall-back to the local model.
      const err = new Error(
        `Couldn't reach your LLM at ${url}.\n` +
        'The browser couldn\'t connect — either the server isn\'t running (or the ' +
        'Base URL/port is wrong), or it\'s running but blocks browser requests (CORS).\n' +
        'Enable CORS: LM Studio → Developer → "Enable CORS" · llama.cpp → run with --cors · Ollama → set OLLAMA_ORIGINS.'
      );
      err.code = 'UNREACHABLE';
      throw err;
    }
  };

  let res = await post(structured);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    // Some servers reject structured output — fall back to prompt-only (BYO-agnostic).
    if (schema && res.status === 400 && /response_format|json_schema|json_object|schema/i.test(body)) {
      res = await post(base);
      if (!res.ok) {
        const b2 = await res.text().catch(() => '');
        throw new Error(httpError(res, b2));
      }
    } else {
      throw new Error(httpError(res, body));
    }
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content ?? '';
  if (!content) throw new Error('Your LLM replied, but with no content. Make sure a model is loaded and the model name in ⚙ matches it.');
  return content;
}

// Run a chat, but if a BYO endpoint is UNREACHABLE, retry on the in-browser
// model instead of failing. Only connection failures fall back — a bad key or a
// model error still surfaces so the user fixes the real problem. No-op when the
// config is already the in-browser engine.
async function chatOrFallback(config, messages, schema) {
  try {
    return await chatRaw(config, messages, { schema });
  } catch (e) {
    if (e.code === 'UNREACHABLE' && !isBrowserProvider(config.base_url)) {
      onFallbackCb?.(config.base_url);
      return chatRaw({ base_url: DEFAULT_BROWSER_BASE }, messages, { schema });
    }
    throw e;
  }
}

// assess: turn free text into one or more scored candidate activities.
export async function assess(config, description) {
  const { messages, schema } = buildAssessMessages(description);
  const out = await chatOrFallback(config, messages, schema);
  return parseModelJson(out);
}

// coach: given the decided move, phrase the coaching and re-estimate scores.
// `locale` localizes the coaching prose only — the JSON contract stays English.
export async function coach(config, { move, focal, portfolio, userText, locale, context }) {
  const { messages, schema } = buildCoachMessages({ move, focal, portfolio, userText, locale, context });
  const out = await chatOrFallback(config, messages, schema);
  return parseModelJson(out);
}
