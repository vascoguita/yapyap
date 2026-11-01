import { describe, expect, it, vi } from 'vitest';
import {
  assistantMayReach,
  confinedFetch,
  guardedAssistantSession,
  RequestRefused,
  type ConfinementSources,
} from './net.ts';

const sources = (localServer = '', testModel?: string): ConfinementSources => ({
  localServer: () => localServer,
  testModel,
});

describe('assistantMayReach', () => {
  it('reaches the providers and Hugging Face over HTTPS only', () => {
    for (const address of [
      'https://api.anthropic.com/v1/messages',
      'https://api.openai.com/v1/chat/completions',
      'https://huggingface.co/Qwen/x/resolve/abc/model.gguf',
      'https://cas-bridge.xethub.hf.co/x',
    ]) {
      expect(assistantMayReach(address, sources())).toBe(true);
    }
    for (const address of [
      'http://api.anthropic.com/v1/messages',
      'https://api.anthropic.com.example.org/',
      'https://hf.co.example.org/',
      'https://example.org/',
      'not an address',
    ]) {
      expect(assistantMayReach(address, sources())).toBe(false);
    }
  });

  it('reaches only the model server on this computer the user chose', () => {
    const chosen = sources('http://localhost:11434/v1');
    expect(assistantMayReach('http://localhost:11434/v1/chat/completions', chosen)).toBe(true);
    expect(assistantMayReach('http://localhost:11434/api/tags', chosen)).toBe(true);
    expect(assistantMayReach('http://localhost:631/', chosen)).toBe(false);
    expect(assistantMayReach('http://127.0.0.1:11434/v1', chosen)).toBe(false);
    expect(assistantMayReach('http://localhost:11434/v1', sources())).toBe(false);
    expect(
      assistantMayReach('http://evil.example:11434/v1', sources('http://evil.example:11434/v1')),
    ).toBe(false);
  });

  it('reaches a test model’s server when a test names one', () => {
    const test = sources('', 'http://127.0.0.1:4000/tiny.gguf');
    expect(assistantMayReach('http://127.0.0.1:4000/tiny.gguf', test)).toBe(true);
    expect(assistantMayReach('http://127.0.0.1:4001/tiny.gguf', test)).toBe(false);
  });
});

describe('confinedFetch', () => {
  it('refuses what the assistant may not reach before anything is sent', async () => {
    const fetch = vi.fn(() => Promise.resolve(new Response('ok')));
    const confined = confinedFetch(fetch, (address) => address.startsWith('https://ok.'));
    await expect(confined('https://no.example/')).rejects.toBeInstanceOf(RequestRefused);
    await expect(confined(new Request('https://no.example/'))).rejects.toThrow(
      'The assistant may not reach this address.',
    );
    expect(fetch).not.toHaveBeenCalled();
    await confined(new URL('https://ok.example/'), { method: 'POST' });
    expect(fetch).toHaveBeenCalledWith('https://ok.example/', {
      method: 'POST',
      credentials: 'omit',
      cache: 'no-store',
    });
    await confined('https://ok.example/a');
    expect(fetch).toHaveBeenLastCalledWith('https://ok.example/a', {
      credentials: 'omit',
      cache: 'no-store',
    });
  });
});

describe('guardedAssistantSession', () => {
  it('cancels every request, redirects included, that the assistant may not send', () => {
    let listener: (
      details: { url: string },
      callback: (response: { cancel: boolean }) => void,
    ) => void = () => undefined;
    const open = vi.fn(() => ({
      webRequest: {
        onBeforeRequest: vi.fn((next: typeof listener) => {
          listener = next;
        }),
      },
    }));
    const session = guardedAssistantSession(open, (address) => address === 'https://ok.example/');
    expect(open).not.toHaveBeenCalled();
    const first = session();
    expect(session()).toBe(first);
    expect(open).toHaveBeenCalledOnce();
    expect(first.webRequest.onBeforeRequest).toHaveBeenCalledOnce();
    const callback = vi.fn();
    listener({ url: 'https://ok.example/' }, callback);
    listener({ url: 'https://elsewhere.example/' }, callback);
    expect(callback.mock.calls).toEqual([[{ cancel: false }], [{ cancel: true }]]);
  });
});
