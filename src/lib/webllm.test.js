import { describe, it, expect } from 'vitest';
import {
  isBrowserProvider, modelFromBase, webgpuAvailable, DEFAULT_BROWSER_MODEL, BROWSER_MODELS,
} from './webllm.js';

describe('browser provider routing', () => {
  it('detects the browser: sentinel base_url', () => {
    expect(isBrowserProvider('browser:Qwen2.5-0.5B')).toBe(true);
    expect(isBrowserProvider('browser:')).toBe(true);
    expect(isBrowserProvider('http://localhost:8080/v1')).toBe(false);
    expect(isBrowserProvider('')).toBe(false);
    expect(isBrowserProvider(undefined)).toBe(false);
    expect(isBrowserProvider(null)).toBe(false);
  });

  it('parses the model id from the sentinel, defaulting when absent', () => {
    expect(modelFromBase('browser:Llama-3.2-1B-Instruct-q4f16_1-MLC'))
      .toBe('Llama-3.2-1B-Instruct-q4f16_1-MLC');
    expect(modelFromBase('browser:')).toBe(DEFAULT_BROWSER_MODEL);
    expect(modelFromBase('browser:   ')).toBe(DEFAULT_BROWSER_MODEL);
  });

  it('exposes a non-empty model catalogue whose ids are valid choices', () => {
    expect(BROWSER_MODELS.length).toBeGreaterThan(0);
    expect(BROWSER_MODELS.every((m) => m.id && m.label)).toBe(true);
    expect(BROWSER_MODELS.map((m) => m.id)).toContain(DEFAULT_BROWSER_MODEL);
  });

  it('webgpuAvailable reflects navigator (false in jsdom)', () => {
    // jsdom has no navigator.gpu, so this must be false and never throw.
    expect(webgpuAvailable()).toBe(false);
  });
});
