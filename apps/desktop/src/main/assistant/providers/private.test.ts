import { describe, expect, it, vi } from 'vitest';
import { EngineFailed, type EngineHost } from '../private/engine-host.ts';
import { privateProvider, turnsOf } from './private.ts';
import { ProviderError } from './provider.ts';

describe('privateProvider', () => {
  it('sends the instructions first, then the conversation, and streams the reply', async () => {
    const complete = vi.fn<EngineHost['complete']>((_turns, onText) => {
      onText('Hi');
      return Promise.resolve({ text: 'Hi', truncated: false });
    });
    const provider = privateProvider({ complete });
    const signal = new AbortController().signal;
    const pieces: string[] = [];
    const request = {
      instructions: 'Suggest replies',
      turns: [{ role: 'user', text: 'Chat: Ana' }],
      signal,
    } as const;
    await expect(provider.complete(request, (piece) => pieces.push(piece))).resolves.toEqual({
      text: 'Hi',
      truncated: false,
    });
    expect(complete).toHaveBeenCalledWith(turnsOf(request), expect.any(Function), signal);
    expect(turnsOf(request)).toEqual([
      { role: 'system', content: 'Suggest replies' },
      { role: 'user', content: 'Chat: Ana' },
    ]);
    expect(pieces).toEqual(['Hi']);
  });

  it('fails with a provider error of the engine’s kind, never the engine’s own words', async () => {
    const request = { instructions: '', turns: [] };
    const short = privateProvider({
      complete: () => Promise.reject(new EngineFailed('out-of-memory')),
    });
    await expect(short.complete(request, () => undefined)).rejects.toEqual(
      new ProviderError('out-of-memory'),
    );
    const broken = privateProvider({
      complete: () => Promise.reject(new Error('quoting “secret”')),
    });
    await expect(broken.complete(request, () => undefined)).rejects.toEqual(
      new ProviderError('failed'),
    );
  });
});
