import { describe, expect, it, vi } from 'vitest';
import { hostPolicy } from './network-policy.ts';

function setup(approved: string[] = ['api.example.org'], local = false) {
  let hosts = approved;
  let answer: (allowed: boolean) => void = () => undefined;
  const deps = {
    id: 'org.example.hello',
    name: () => 'Hello',
    approved: () => hosts,
    ask: vi.fn<(extension: string, host: string) => Promise<boolean>>(
      () =>
        new Promise<boolean>((resolve) => {
          answer = resolve;
        }),
    ),
    approve: vi.fn((host: string) => {
      hosts = [...hosts, host];
      return Promise.resolve();
    }),
    local: () => local,
  };
  return {
    deps,
    decide: hostPolicy(deps),
    answer: (allowed: boolean) => {
      answer(allowed);
    },
  };
}

describe('hostPolicy', () => {
  it('lets the extension load its own files and reach the hosts the user approved', async () => {
    const t = setup();
    expect(await t.decide('extension://org.example.hello/main.js')).toBe(true);
    expect(await t.decide('https://api.example.org/v1/chat')).toBe(true);
    expect(t.deps.ask).not.toHaveBeenCalled();
  });

  it('cancels anything that is not plain HTTPS, without asking', async () => {
    const t = setup();
    for (const url of [
      'http://api.example.org/',
      'wss://api.example.org/',
      'https://api.example.org:8443/',
      'https://user:secret@api.example.org/',
      'https://192.168.1.1/',
      'extension://org.example.other/main.js',
      'not a url',
    ]) {
      expect(await t.decide(url)).toBe(false);
    }
    expect(t.deps.ask).not.toHaveBeenCalled();
  });

  it('asks before a new host, and keeps the user’s yes for good', async () => {
    const t = setup();
    const first = t.decide('https://llm.example.net/v1');
    const again = t.decide('https://llm.example.net/v1/models');
    expect(t.deps.ask).toHaveBeenCalledExactlyOnceWith('Hello', 'llm.example.net');
    t.answer(true);
    expect(await first).toBe(true);
    expect(await again).toBe(true);
    expect(t.deps.approve).toHaveBeenCalledExactlyOnceWith('llm.example.net');
    expect(await t.decide('https://llm.example.net/v2')).toBe(true);
    expect(t.deps.ask).toHaveBeenCalledOnce();
  });

  it('remembers a no, and asks about one host at a time', async () => {
    const t = setup();
    const first = t.decide('https://tracker.example.com/');
    expect(await t.decide('https://other.example.com/')).toBe(false);
    t.answer(false);
    expect(await first).toBe(false);
    expect(await t.decide('https://tracker.example.com/')).toBe(false);
    expect(t.deps.ask).toHaveBeenCalledOnce();
    expect(t.deps.approve).not.toHaveBeenCalled();
  });

  it('never asks for a host the extension could not hold, once it holds all it may', async () => {
    const full = Array.from({ length: 32 }, (_, index) => `h${String(index)}.example.org`);
    const t = setup(full);
    expect(await t.decide('https://one-more.example.org/')).toBe(false);
    expect(t.deps.ask).not.toHaveBeenCalled();
  });

  it('reaches servers on this computer only with the grant, and nothing else nearby', async () => {
    const granted = setup([], true);
    for (const url of [
      'http://localhost:11434/v1/chat/completions',
      'http://127.0.0.1:8080/',
      'https://localhost/v1',
      'http://[::1]:1234/',
    ]) {
      expect(await granted.decide(url)).toBe(true);
    }
    for (const url of [
      'http://192.168.1.10:11434/',
      'http://user:secret@localhost:11434/',
      'ws://localhost:8080/',
      'http://localhost.example.org/',
    ]) {
      expect(await granted.decide(url)).toBe(false);
    }
    const refused = setup([], false);
    expect(await refused.decide('http://localhost:11434/')).toBe(false);
    expect(granted.deps.ask).not.toHaveBeenCalled();
    expect(refused.deps.ask).not.toHaveBeenCalled();
  });
});
