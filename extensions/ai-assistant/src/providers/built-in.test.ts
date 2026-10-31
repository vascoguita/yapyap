import { describe, expect, it, vi } from 'vitest';
import { EngineError, type Engine } from '../built-in/engine.ts';
import { builtInProvider, turnsOf } from './built-in.ts';
import { ProviderError } from './provider.ts';

const engine = (chat: Engine['chat']): Engine => ({
  load: vi.fn(),
  unload: vi.fn(),
  chat,
});

describe('builtInProvider', () => {
  it('sends the instructions first, then the conversation, and streams the reply', async () => {
    const chat = vi.fn<Engine['chat']>((_turns, onText) => {
      onText('Hi');
      return Promise.resolve({ text: 'Hi', truncated: false });
    });
    const provider = builtInProvider(() => Promise.resolve(engine(chat)));
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
    expect(chat).toHaveBeenCalledWith(turnsOf(request), expect.any(Function), signal);
    expect(turnsOf(request)).toEqual([
      { role: 'system', content: 'Suggest replies' },
      { role: 'user', content: 'Chat: Ana' },
    ]);
    expect(pieces).toEqual(['Hi']);
  });

  it('fails with a provider error of the engine’s kind, never the engine’s own words', async () => {
    const short = builtInProvider(() => Promise.reject(new Error('Aborted(OOM) at chat “secret”')));
    const request = { instructions: '', turns: [] };
    await expect(short.complete(request, () => undefined)).rejects.toEqual(
      new ProviderError('out-of-memory'),
    );
    const stopped = builtInProvider(() =>
      Promise.resolve(engine(() => Promise.reject(new EngineError('cancelled')))),
    );
    await expect(stopped.complete(request, () => undefined)).rejects.toEqual(
      new ProviderError('cancelled'),
    );
  });
});
