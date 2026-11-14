import { describe, expect, it, vi } from 'vitest';
import {
  assistantMayReach,
  confinedFetch,
  guardedAssistantSession,
  RequestRefused,
  type ConfinementSources,
} from './net.ts';

const sources = (server = ''): ConfinementSources => ({ server: () => server });

describe('assistantMayReach', () => {
  it('reaches the services over HTTPS only', () => {
    for (const address of [
      'https://api.anthropic.com/v1/messages',
      'https://api.openai.com/v1/chat/completions',
    ]) {
      expect(assistantMayReach(address, sources())).toBe(true);
    }
    for (const address of [
      'http://api.anthropic.com/v1/messages',
      'https://api.anthropic.com.example.org/',
      'https://huggingface.co/Qwen/x/resolve/abc/model.gguf',
      'https://example.org/',
      'not an address',
    ]) {
      expect(assistantMayReach(address, sources())).toBe(false);
    }
  });

  it('reaches only the model server the user chose, at its origin', () => {
    const home = sources('http://192.168.1.20:11434/v1');
    expect(assistantMayReach('http://192.168.1.20:11434/v1/chat/completions', home)).toBe(true);
    expect(assistantMayReach('http://192.168.1.20:11434/api/tags', home)).toBe(true);
    expect(assistantMayReach('http://192.168.1.20:631/', home)).toBe(false);
    expect(assistantMayReach('http://192.168.1.21:11434/v1', home)).toBe(false);
    expect(assistantMayReach('http://localhost:11434/v1', sources())).toBe(false);
    const cloud = sources('https://openrouter.ai/api/v1');
    expect(assistantMayReach('https://openrouter.ai/api/v1/models', cloud)).toBe(true);
    expect(assistantMayReach('http://openrouter.ai/api/v1/models', cloud)).toBe(false);
  });

  it('never reaches a server a settings file names that the settings may not hold', () => {
    const plain = sources('http://evil.example:11434/v1');
    expect(assistantMayReach('http://evil.example:11434/v1', plain)).toBe(false);
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
