import { describe, expect, it, vi } from 'vitest';
import { assistantBarFor, type BarSources } from './bar-sources.ts';

function sources(chat: { name: string } | null = { name: 'Alex' }) {
  let changed = (): void => undefined;
  const runtime = {
    assistants: vi.fn(() => [{ id: 'org.example.ai', name: 'Assistant' }]),
    askAssistant: vi.fn(() => true),
    onChange: vi.fn((listener: () => void) => {
      changed = listener;
    }),
  };
  const accounts = {
    readActiveChat: vi.fn(() => Promise.resolve(chat)),
    replaceDraft: vi.fn(() => Promise.resolve(true)),
    pressEnter: vi.fn(() => Promise.resolve(true)),
  };
  const given: BarSources = { runtime, accounts };
  return {
    runtime,
    accounts,
    given,
    change: () => {
      changed();
    },
  };
}

describe('assistantBarFor', () => {
  it('shows nothing until it has a view, then follows the extensions as they change', () => {
    const s = sources();
    const { bar, attach: give } = assistantBarFor(s.given);
    s.change();
    expect(bar.state().extension).toBe('Assistant');
    const view = { show: vi.fn(), publish: vi.fn() };
    give((given) => {
      expect(given).toBe(bar);
      return view;
    });
    expect(view.show).toHaveBeenLastCalledWith(true);
    s.runtime.assistants.mockReturnValue([]);
    s.change();
    expect(view.show).toHaveBeenLastCalledWith(false);
    expect(view.publish).toHaveBeenLastCalledWith(expect.objectContaining({ extension: '' }));
  });

  it('asks the extension about the open chat, read one message deep, and sends through the account', async () => {
    const s = sources();
    const { bar, attach: give } = assistantBarFor(s.given);
    give(() => ({ show: vi.fn(), publish: vi.fn() }));
    await bar.suggest();
    expect(s.accounts.readActiveChat).toHaveBeenCalledWith(1);
    expect(s.runtime.askAssistant).toHaveBeenCalledWith('org.example.ai', { type: 'suggest' });
    bar.offer('org.example.ai', { suggestions: ['On my way'] });
    await bar.send(0);
    expect(s.accounts.replaceDraft).toHaveBeenCalledWith('On my way');
    expect(s.accounts.pressEnter).toHaveBeenCalledOnce();
  });

  it('tells the user to open a chat when none is', async () => {
    const s = sources(null);
    const { bar } = assistantBarFor(s.given);
    s.change();
    await bar.suggest();
    expect(bar.state().status).toBe('Open a chat first.');
    expect(s.runtime.askAssistant).not.toHaveBeenCalled();
  });
});
