/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeChromeApi } from '../../../test/chrome-api.ts';
import { nth } from '../../../test/nth.ts';
import type { AssistantView, SettingsSnapshot } from '../../shared/api/chrome-api.ts';
import { AssistantSection } from './Assistant.tsx';

const VIEW: AssistantView = {
  inUse: 'anthropic',
  status: '',
  keys: { anthropic: true, openai: false, server: false },
  models: [
    { id: 'claude-opus', label: 'Opus' },
    { id: 'claude-haiku', label: 'Haiku' },
  ],
  auto: { id: 'claude-haiku', label: 'Haiku' },
  chats: [
    {
      account: 'a',
      accountName: 'Home',
      chats: [
        { id: 'f'.repeat(64), name: 'Ana' },
        { id: 'e'.repeat(64), name: null },
      ],
    },
  ],
};

const SNAPSHOT: SettingsSnapshot = {
  values: {
    'assistant.enabled': true,
    'assistant.provider': 'anthropic',
    'assistant.model': 'claude-opus',
    'assistant.autoSuggest': true,
    'assistant.chats': 'chosen',
    'assistant.messages': '10',
    'assistant.server': '',
  },
  restartPending: false,
  problems: {},
};

const choosing = (provider: string, more: SettingsSnapshot['values'] = {}): SettingsSnapshot => ({
  ...SNAPSHOT,
  values: { ...SNAPSHOT.values, 'assistant.provider': provider, ...more },
});

const HOME = 'http://192.168.1.20:11434/v1';

function setup(view: AssistantView = VIEW, snapshot: SettingsSnapshot = SNAPSHOT) {
  let current = view;
  const assistant = {
    view: vi.fn(() => Promise.resolve(current)),
    saveKey: vi.fn(() => Promise.resolve(true)),
    forgetKey: vi.fn(() => Promise.resolve()),
    testKey: vi.fn(() => Promise.resolve('')),
    findServers: vi.fn(() =>
      Promise.resolve([
        { server: 'localhost:11434', endpoint: 'http://localhost:11434/v1', models: ['tiny'] },
        { server: 'localhost:1234', endpoint: 'http://localhost:1234/v1', models: [] },
      ]),
    ),
    forgetChat: vi.fn(() => Promise.resolve()),
    allowOpenChat: vi.fn(() => Promise.resolve(true)),
  };
  const onChange = vi.fn();
  const api = fakeChromeApi({ assistant });
  render(<AssistantSection api={api} snapshot={snapshot} onChange={onChange} />);
  return {
    assistant,
    onChange,
    setView: (next: AssistantView) => {
      current = next;
    },
  };
}

/** The provider's row, by the name of its radio button. */
const provider = (name: string | RegExp): HTMLElement => {
  const radio = screen.getByRole('radio', { name });
  const row = radio.closest<HTMLElement>('.provider');
  if (row === null) {
    throw new Error('No provider row.');
  }
  return row;
};

/** The status on a provider's row. */
const pillOf = (name: string | RegExp): string | null =>
  provider(name).querySelector('.pill')?.textContent ?? null;

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('AssistantSection', () => {
  it('says once that it is ready, and with whom, and what that sends where', async () => {
    const t = setup();
    expect(screen.getByText('Loading…')).toBeTruthy();
    expect(document.querySelector('.assistant')?.getAttribute('aria-busy')).toBe('true');
    expect(await screen.findByText('Ready. Using Claude (Anthropic).')).toBeTruthy();
    expect(document.querySelector('.assistant')?.getAttribute('aria-busy')).toBe('false');
    expect(document.querySelectorAll('.status-line')).toHaveLength(1);
    expect(
      screen.getByText(
        'Sends the last 10 messages of the open chat, plus its instructions, to Anthropic. When rewriting, it sends only what you typed. YapYap logs none of it.',
      ),
    ).toBeTruthy();
    for (const name of ['Show the assistant in chats', 'Suggest replies']) {
      expect(screen.getByRole('switch', { name })).toBeTruthy();
    }
    expect(screen.getByRole('radiogroup', { name: 'Messages it reads' })).toBeTruthy();
    expect(screen.getByRole('radiogroup', { name: 'Where the assistant works' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Only chosen chats' })).toHaveProperty(
      'checked',
      true,
    );
    fireEvent.click(screen.getByRole('radio', { name: '20' }));
    expect(t.onChange).toHaveBeenCalledWith('assistant.messages', '20');
  });

  it('lists the providers with their status, and opens only the chosen one', async () => {
    const t = setup();
    await screen.findByText('Ready. Using Claude (Anthropic).');
    const list = screen.getByRole('group', { name: 'Provider' });
    expect(
      within(list)
        .getAllByRole('radio')
        .map((radio) => radio.getAttribute('value')),
    ).toEqual(['anthropic', 'openai', 'server']);
    expect(screen.getByRole('radio', { name: 'Claude (Anthropic)' })).toHaveProperty(
      'checked',
      true,
    );
    expect(pillOf('Claude (Anthropic)')).toBe('Key saved');
    expect(pillOf('OpenAI')).toBe('Needs key');
    expect(pillOf('Model server')).toBe('Not set up');
    const radio = screen.getByRole('radio', { name: 'OpenAI' });
    expect(radio.getAttribute('aria-describedby')).toBe(
      'provider-openai-hint provider-openai-pill',
    );
    // Only Claude is chosen, so only its key and model list show.
    expect(screen.getAllByLabelText('API key')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Find on This Computer' })).toBeNull();
    expect(screen.getByLabelText('Model')).toHaveProperty('value', 'claude-opus');
    fireEvent.click(radio);
    expect(t.onChange).toHaveBeenCalledWith('assistant.provider', 'openai');
  });

  it('offers Auto, which names its pick, or the provider’s models', async () => {
    const t = setup();
    const model = await screen.findByLabelText('Model');
    expect(model.getAttribute('aria-describedby')).toBe('assistant-model-hint');
    expect(screen.getByRole('option', { name: 'Auto (recommended): Haiku' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: 'Haiku' })).toBeNull();
    fireEvent.change(model, { target: { value: 'auto' } });
    expect(t.onChange).toHaveBeenCalledWith('assistant.model', 'auto');
    cleanup();
    setup({ ...VIEW, auto: null }, choosing('anthropic', { 'assistant.model': 'gone' }));
    expect(await screen.findByLabelText('Model')).toHaveProperty('value', 'auto');
    expect(screen.getByRole('option', { name: 'Auto (recommended)' })).toBeTruthy();
  });

  it('chooses no provider until the user does, and sends nothing before', async () => {
    setup(
      { ...VIEW, inUse: null, status: 'Set up the assistant.', models: [], auto: null },
      choosing('none'),
    );
    expect(await screen.findByText('Not set up yet. Choose a provider below.')).toBeTruthy();
    expect(screen.queryByText('Set up the assistant.')).toBeNull();
    const list = screen.getByRole('group', { name: 'Provider' });
    for (const radio of within(list).getAllByRole<HTMLInputElement>('radio')) {
      expect(radio.checked).toBe(false);
    }
    expect(screen.getByText('Nothing is sent anywhere until you set up a provider.')).toBeTruthy();
    expect(screen.queryByLabelText('Model')).toBeNull();
    expect(screen.queryByLabelText('API key')).toBeNull();
  });

  it('says what the chosen provider still needs', async () => {
    setup(
      { ...VIEW, inUse: 'openai', status: 'Paste your API key for OpenAI to start.' },
      choosing('openai'),
    );
    expect(await screen.findByText('Paste your API key for OpenAI to start.')).toBeTruthy();
    expect(document.querySelector('.status-line')?.classList.contains('warning')).toBe(true);
    expect(screen.getByText(/to OpenAI\. When rewriting/)).toBeTruthy();
  });

  it('saves a key, which it never shows, then tests, replaces and removes it', async () => {
    const t = setup({ ...VIEW, keys: { anthropic: false, openai: false, server: false } });
    const key = await screen.findByLabelText('API key');
    expect(
      screen.getByRole('link', { name: 'Get a key from Anthropic' }).getAttribute('href'),
    ).toBe('https://console.anthropic.com/settings/keys');
    fireEvent.click(screen.getByRole('button', { name: 'Save Key' }));
    expect(await screen.findByText('Paste a key first.')).toBeTruthy();
    fireEvent.input(key, { target: { value: 'sk-ant' } });
    t.setView(VIEW);
    fireEvent.click(screen.getByRole('button', { name: 'Save Key' }));
    await waitFor(() => {
      expect(t.assistant.saveKey).toHaveBeenCalledWith('anthropic', 'sk-ant');
    });
    const saved = await screen.findByText('A key is saved, encrypted by your system.');
    expect(saved.closest('output')?.getAttribute('aria-labelledby')).toBe(
      'assistant-key-anthropic-label',
    );
    expect(screen.queryByDisplayValue('sk-ant')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Test' }));
    expect(await screen.findByText('The key works.')).toBeTruthy();
    t.assistant.testKey.mockResolvedValueOnce('Claude (Anthropic) did not accept your key.');
    fireEvent.click(screen.getByRole('button', { name: 'Test' }));
    expect(await screen.findByText('Claude (Anthropic) did not accept your key.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Replace' }));
    expect(screen.getByLabelText('API key')).toHaveProperty('value', '');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('A key is saved, encrypted by your system.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => {
      expect(t.assistant.forgetKey).toHaveBeenCalledWith('anthropic');
    });
  });

  it('says when the system cannot keep a key safely', async () => {
    const t = setup(VIEW, choosing('openai'));
    t.assistant.saveKey.mockResolvedValueOnce(false);
    fireEvent.input(await screen.findByLabelText('API key'), { target: { value: 'sk-openai' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Key' }));
    expect(await screen.findByText(/cannot keep the key safely/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Get a key from OpenAI' })).toBeTruthy();
  });

  it('finds model servers on this computer, and uses one or a typed address', async () => {
    const server = { 'assistant.server': 'http://localhost:8080/v1' };
    const t = setup({ ...VIEW, inUse: 'server' }, choosing('server', server));
    expect(await screen.findByText('Using http://localhost:8080/v1.')).toBeTruthy();
    expect(pillOf('Model server')).toBe('Address saved');
    expect(screen.getByText('Everything stays on this computer.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Find on This Computer' }));
    expect(await screen.findByText('localhost:11434: tiny')).toBeTruthy();
    expect(screen.getByText('localhost:1234: no models yet')).toBeTruthy();
    fireEvent.click(nth(screen.getAllByRole('button', { name: 'Use' }), 0));
    expect(t.onChange.mock.calls).toEqual([
      ['assistant.server', 'http://localhost:11434/v1'],
      ['assistant.provider', 'server'],
    ]);
    const address = screen.getByLabelText('Address');
    fireEvent.input(address, { target: { value: 'http://example.org:80' } });
    fireEvent.click(screen.getByRole('button', { name: 'Use This Address' }));
    expect(await screen.findByText(/Plain http:\/\/ works only on this computer/)).toBeTruthy();
    fireEvent.input(address, { target: { value: '192.168.1.20:11434' } });
    fireEvent.click(screen.getByRole('button', { name: 'Use This Address' }));
    expect(t.onChange).toHaveBeenCalledWith('assistant.server', HOME);
    fireEvent.input(address, { target: { value: 'openrouter.ai/api/v1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Use This Address' }));
    expect(t.onChange).toHaveBeenCalledWith('assistant.server', 'https://openrouter.ai/api/v1');
    t.assistant.findServers.mockResolvedValueOnce([]);
    fireEvent.click(screen.getByRole('button', { name: 'Find on This Computer' }));
    expect(await screen.findByText(/No model server answers/)).toBeTruthy();
  });

  it('takes an optional key for a model server, with no page to get one', async () => {
    const cloud = { 'assistant.server': 'https://models.example/v1' };
    const t = setup({ ...VIEW, inUse: 'server' }, choosing('server', cloud));
    const key = await screen.findByLabelText('API key (optional)');
    expect(screen.getByText('Only if the server asks for one, as cloud services do.')).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Get a key/ })).toBeNull();
    fireEvent.input(key, { target: { value: 'sk-cloud' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Key' }));
    await waitFor(() => {
      expect(t.assistant.saveKey).toHaveBeenCalledWith('server', 'sk-cloud');
    });
    expect(
      screen.getByText(
        'Sends the last 10 messages of the open chat, plus its instructions, to models.example. When rewriting, it sends only what you typed. YapYap logs none of it.',
      ),
    ).toBeTruthy();
  });

  it('sends nothing to a server chosen before it has an address', async () => {
    setup(
      { ...VIEW, inUse: 'server', status: 'Set up the assistant to start: choose a provider.' },
      choosing('server'),
    );
    expect(await screen.findByLabelText('Address')).toBeTruthy();
    expect(screen.getByText('Nothing is sent anywhere until you set up a provider.')).toBeTruthy();
    expect(document.querySelectorAll('.assistant')).toHaveLength(1);
  });

  it('names a server on the home network as where messages go', async () => {
    setup({ ...VIEW, inUse: 'server' }, choosing('server', { 'assistant.server': HOME }));
    expect(await screen.findByText(/to 192\.168\.1\.20:11434\. When rewriting/)).toBeTruthy();
  });

  it('lists the chats it works in, each with Remove', async () => {
    const t = setup();
    expect(await screen.findByText('Home: Ana')).toBeTruthy();
    expect(screen.getByText('Home: A chat allowed before (its name was not kept)')).toBeTruthy();
    expect(screen.getByText('Chats you add show up here.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Stop reading Ana' }));
    await waitFor(() => {
      expect(t.assistant.forgetChat).toHaveBeenCalledWith('a', 'f'.repeat(64));
    });
    cleanup();
    setup({ ...VIEW, chats: [] });
    expect(await screen.findByText('No chats yet.')).toBeTruthy();
  });

  it('adds the chat open in WhatsApp, and says when none is open', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const t = setup();
    const add = await screen.findByRole('button', { name: 'Add Open Chat' });
    fireEvent.click(add);
    await waitFor(() => {
      expect(t.assistant.view).toHaveBeenCalledTimes(2);
    });
    expect(t.assistant.allowOpenChat).toHaveBeenCalledOnce();
    expect(screen.queryByText('Open a chat in WhatsApp first.')).toBeNull();
    t.assistant.allowOpenChat.mockResolvedValueOnce(false);
    fireEvent.click(add);
    expect(await screen.findByText('Open a chat in WhatsApp first.')).toBeTruthy();
    // A change reads the view again, so what it changed shows at once.
    fireEvent.click(screen.getByRole('radio', { name: 'All chats' }));
    await vi.advanceTimersByTimeAsync(0);
    expect(t.assistant.view).toHaveBeenCalledTimes(4);
  });

  it('lists no chats while the assistant works in every chat', async () => {
    setup(VIEW, { ...SNAPSHOT, values: { ...SNAPSHOT.values, 'assistant.chats': 'all' } });
    expect(await screen.findByText('Ready. Using Claude (Anthropic).')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'All chats' })).toHaveProperty('checked', true);
    expect(screen.queryByText('Home: Ana')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add Open Chat' })).toBeNull();
  });

  it('keeps loading while the view cannot be read', async () => {
    const t = setup();
    t.assistant.view.mockRejectedValue(new Error('busy'));
    cleanup();
    render(
      <AssistantSection
        api={fakeChromeApi({ assistant: t.assistant })}
        snapshot={SNAPSHOT}
        onChange={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(t.assistant.view).toHaveBeenCalledTimes(2);
    });
    expect(screen.getByText('Loading…')).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Show the assistant in chats' })).toBeTruthy();
  });
});
