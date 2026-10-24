import { describe, expect, it, vi } from 'vitest';
import { draftReply, insertDraft, supportsInlineReply } from './reply.ts';

function setup(answers: unknown[]) {
  const contents = {
    executeJavaScriptInIsolatedWorld: vi.fn(() => {
      const answer = answers.shift();
      return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
    }),
    insertText: vi.fn(() => Promise.resolve()),
  };
  const deps = { wait: vi.fn(() => Promise.resolve()), warn: vi.fn() };
  return { contents, deps };
}

describe('draftReply', () => {
  it('waits for WhatsApp to open the chat, then types the reply as a draft', async () => {
    const t = setup([false, new Error('navigating'), true]);
    await draftReply(t.contents, 'On my way', t.deps);
    expect(t.deps.wait).toHaveBeenCalledTimes(3);
    expect(t.deps.wait).toHaveBeenCalledWith(400);
    expect(t.contents.insertText).toHaveBeenCalledExactlyOnceWith('On my way');
    const [world, scripts] = t.contents.executeJavaScriptInIsolatedWorld.mock
      .calls[0] as unknown as [number, { code: string }[]];
    expect(world).toBe(1000);
    expect(scripts[0]?.code).toContain('#main footer [contenteditable=\\"true\\"]');
    expect(t.deps.warn).not.toHaveBeenCalled();
  });

  it('gives up after a few seconds without a message box, and never logs the text', async () => {
    const t = setup(Array.from({ length: 8 }, () => false));
    await draftReply(t.contents, 'Secret plans', t.deps);
    expect(t.deps.wait).toHaveBeenCalledTimes(8);
    expect(t.contents.insertText).not.toHaveBeenCalled();
    expect(t.deps.warn).toHaveBeenCalledExactlyOnceWith(
      'Could not put a notification reply in WhatsApp’s message box.',
    );
  });
});

describe('insertDraft', () => {
  it('types a plugin’s draft into the open chat’s message box, and nothing when none is open', async () => {
    const t = setup([true, false]);
    await expect(insertDraft(t.contents, 'Draft')).resolves.toBe(true);
    expect(t.contents.insertText).toHaveBeenCalledExactlyOnceWith('Draft');
    await expect(insertDraft(t.contents, 'Again')).resolves.toBe(false);
    expect(t.contents.insertText).toHaveBeenCalledOnce();
  });
});

describe('supportsInlineReply', () => {
  it('is offered on macOS and Windows only', () => {
    expect(['darwin', 'win32', 'linux'].map(supportsInlineReply)).toEqual([true, true, false]);
  });
});
