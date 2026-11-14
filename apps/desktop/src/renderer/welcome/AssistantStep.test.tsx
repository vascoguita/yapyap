/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeChromeApi } from '../../../test/chrome-api.ts';
import type { AssistantView, FoundServer } from '../../shared/api/chrome-api.ts';
import { AssistantStep } from './AssistantStep.tsx';

const VIEW: AssistantView = {
  inUse: null,
  status: '',
  keys: { anthropic: false, openai: false, server: false },
  models: [],
  auto: null,
  chats: [],
};

const SERVERS: readonly FoundServer[] = [
  { server: 'localhost:1234', endpoint: 'http://localhost:1234/v1', models: [] },
  { server: 'localhost:11434', endpoint: 'http://localhost:11434/v1', models: ['tiny'] },
];

function setup(servers: () => Promise<readonly FoundServer[]> = () => Promise.resolve(SERVERS)) {
  const assistant = {
    view: vi.fn(() => Promise.resolve(VIEW)),
    findServers: vi.fn(servers),
    saveKey: vi.fn(() => Promise.resolve(true)),
  };
  const onChange = vi.fn();
  render(<AssistantStep api={fakeChromeApi({ assistant })} onChange={onChange} />);
  return { assistant, onChange };
}

afterEach(() => {
  cleanup();
});

describe('AssistantStep', () => {
  it('offers the model server it found on this computer first', async () => {
    const t = setup();
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Use the Model Server on This Computer (localhost:11434)',
      }),
    );
    expect(t.onChange.mock.calls).toEqual([
      ['assistant.server', 'http://localhost:11434/v1'],
      ['assistant.provider', 'server'],
    ]);
    expect(screen.getByText(/^Done\./)).toBeTruthy();
  });

  it('offers no server when none serves a model on this computer', async () => {
    setup(() => Promise.resolve([]));
    expect(await screen.findByRole('button', { name: 'Use Claude with My API Key' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Model Server/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Private/ })).toBeNull();
  });

  it('asks for a key for Claude or OpenAI, and leaves everything as it is for later', async () => {
    const t = setup(() => Promise.reject(new Error('busy')));
    fireEvent.click(await screen.findByRole('button', { name: 'Use Claude with My API Key' }));
    expect(t.onChange).toHaveBeenCalledWith('assistant.provider', 'anthropic');
    fireEvent.input(screen.getByLabelText('API key'), {
      target: { value: 'sk-ant' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Key' }));
    await waitFor(() => {
      expect(t.assistant.saveKey).toHaveBeenCalledWith('anthropic', 'sk-ant');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Use OpenAI with My API Key' }));
    expect(screen.getByLabelText('API key')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Get a key from OpenAI' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Later' }));
    expect(screen.queryByLabelText('API key')).toBeNull();
    expect(t.onChange).toHaveBeenCalledTimes(2);
  });
});
