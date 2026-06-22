// llm.js — bring-your-own-LLM transport (OpenAI-compatible /chat/completions).
// The model CONTRACT (system briefs, schemas, message builders, parse) lives in
// prompts.js so every front door (web, skill, MCP) shares it. This file is ONLY
// the transport + thin assess/coach wrappers: feed a builder's messages to the
// model, return the parsed JSON. The math (ikigai.js) and the move decision
// (policy.js) live elsewhere; the LLM only estimates scores and phrases coaching.

import { isBrowserProvider, browserChat } from './webllm.js';
import {
  buildAssessMessages,
  buildCoachMessages,
  parseModelJson,
  extractJson,
} from './prompts.js';

// Re-export so existing importers (and llm.test.js) keep resolving extractJson here.
export { extractJson };

// Build the chat-completions URL tolerantly: accept a bare host
// (http://127.0.0.1:1234), a /v1 base, or a full .../chat/completions URL.
export function completionsUrl(base) {
  const b = (base || '').trim().replace(/\/+$/, '');
  if (!b) return '';
  if (/\/chat\/completions$/.test(b)) return b;
  if (/\/v\d+$/.test(b)) return `${b}/chat/completions`;
  return `${b}/v1/chat/completions`;
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
    } catch (e) {
      // Browser fetch throws a TypeError for network failures AND blocked CORS.
      throw new Error(
        `Could not reach ${url} (${e.message}). Check the server is running ` +
        `and CORS is enabled (LM Studio: Developer tab → Settings → "Enable CORS").`
      );
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
        throw new Error(`LLM ${res.status} ${res.statusText}: ${b2.slice(0, 300)}`);
      }
    } else {
      throw new Error(`LLM ${res.status} ${res.statusText}: ${body.slice(0, 300)}`);
    }
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content ?? '';
  if (!content) throw new Error('Model returned empty content (is a model loaded and the model name correct?).');
  return content;
}

// assess: turn free text into one or more scored candidate activities.
export async function assess(config, description) {
  const { messages, schema } = buildAssessMessages(description);
  const out = await chatRaw(config, messages, { schema });
  return parseModelJson(out);
}

// coach: given the decided move, phrase the coaching and re-estimate scores.
// `locale` localizes the coaching prose only — the JSON contract stays English.
export async function coach(config, { move, focal, portfolio, userText, locale }) {
  const { messages, schema } = buildCoachMessages({ move, focal, portfolio, userText, locale });
  const out = await chatRaw(config, messages, { schema });
  return parseModelJson(out);
}
