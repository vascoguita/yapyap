import { describe, expect, it, vi } from 'vitest';
import type { PluginConsent } from '../../shared/chrome-api.ts';
import { createPluginConsent } from './consent.ts';

const CONSENT: PluginConsent = {
  id: 'org.example.hello',
  name: 'Hello',
  version: '1.0.0',
  author: { name: 'Example', url: null },
  fingerprint: 'ab:cd',
  trust: 'third-party',
  update: false,
  capabilities: ['storage:local'],
  hosts: [],
  added: { capabilities: [], hosts: [] },
};

function setup() {
  let closed: (() => void) | undefined;
  const window = {
    webContents: {},
    close: vi.fn(() => closed?.()),
    onClosed: vi.fn((listener: () => void) => {
      closed = listener;
    }),
  };
  const open = vi.fn(() => window);
  const prompt = createPluginConsent(open);
  const handler = (channel: string) => {
    const found = prompt.handlers.find((candidate) => candidate.channel === channel);
    if (found === undefined) {
      throw new Error(`No handler for ${channel}`);
    }
    return found;
  };
  const call = { sender: window.webContents };
  return { window, open, prompt, handler, call, closeByUser: () => closed?.() };
}

describe('createPluginConsent', () => {
  it('shows the pending install to its own window only', async () => {
    const t = setup();
    const answer = t.prompt.ask(CONSENT);
    expect(t.handler('plugins:consent').handle(t.call)).toBe(CONSENT);
    expect(() => t.handler('plugins:consent').handle({ sender: {} })).toThrow(
      'No plugin install belongs to this window.',
    );
    t.handler('plugins:answer').handle(t.call, false, false);
    await expect(answer).resolves.toBe(false);
    expect(t.window.close).toHaveBeenCalledOnce();
  });

  it('installs a third-party plugin only once the user accepts the risk', async () => {
    const t = setup();
    const answer = t.prompt.ask(CONSENT);
    const respond = t.handler('plugins:answer');
    expect(() => respond.handle(t.call, true, false)).toThrow(
      'A plugin YapYap has not reviewed needs the user to accept the risk.',
    );
    respond.handle(t.call, true, true);
    await expect(answer).resolves.toBe(true);
  });

  it('needs no acknowledgement for a plugin signed by YapYap', async () => {
    const t = setup();
    const answer = t.prompt.ask({ ...CONSENT, trust: 'first-party' });
    t.handler('plugins:answer').handle(t.call, true, false);
    await expect(answer).resolves.toBe(true);
  });

  it('counts closing the window as a refusal, and asks one install at a time', async () => {
    const t = setup();
    const answer = t.prompt.ask(CONSENT);
    await expect(t.prompt.ask(CONSENT)).resolves.toBe(false);
    t.closeByUser();
    t.closeByUser();
    await expect(answer).resolves.toBe(false);
    expect(t.open).toHaveBeenCalledOnce();
  });

  it('accepts only two flags as an answer', () => {
    const t = setup();
    const { accepts } = t.handler('plugins:answer');
    expect(accepts([true, true])).toBe(true);
    expect(accepts([true])).toBe(false);
    expect(accepts(['yes', true])).toBe(false);
    expect(accepts([true, 'yes'])).toBe(false);
    expect(accepts([true, true, true])).toBe(false);
  });
});
