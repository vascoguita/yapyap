/** @vitest-environment happy-dom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AssistantBarState, ChromeApi } from '../../shared/chrome-api.ts';
import { AssistantBar } from './AssistantBar.tsx';

const STATE: AssistantBarState = {
  extension: 'AI assistant',
  status: '',
  suggestions: [],
  confirm: undefined,
  working: false,
};

function setup(first: () => Promise<AssistantBarState> = () => Promise.resolve(STATE)) {
  let push: ((next: AssistantBarState) => void) | undefined;
  const assistantBar = {
    state: vi.fn(first),
    suggest: vi.fn(() => Promise.resolve()),
    prompt: vi.fn(() => Promise.resolve()),
    confirm: vi.fn(() => Promise.resolve()),
    use: vi.fn(() => Promise.resolve()),
    send: vi.fn(() => Promise.resolve()),
    onState: vi.fn((listener: (next: AssistantBarState) => void) => {
      push = listener;
    }),
  };
  render(<AssistantBar api={{ assistantBar } as unknown as ChromeApi} />);
  return {
    assistantBar,
    push: (next: Partial<AssistantBarState>) => {
      void act(() => {
        push?.({ ...STATE, ...next });
      });
    },
  };
}

afterEach(() => {
  cleanup();
});

describe('AssistantBar', () => {
  it('names the extension and asks it for suggestions on a click', async () => {
    const t = setup();
    await screen.findByText('From AI assistant');
    fireEvent.click(screen.getByRole('button', { name: 'Suggest replies' }));
    expect(t.assistantBar.suggest).toHaveBeenCalledOnce();
  });

  it('shows suggestions as text, puts one in the message box, or sends it, on a click', async () => {
    const t = setup();
    await screen.findByText('From AI assistant');
    t.push({ suggestions: ['Yes, 8 works!', '<b>Not markup</b>'], status: 'Two ideas' });
    expect(screen.getByRole('status').textContent).toBe('Two ideas');
    expect(screen.getByText('<b>Not markup</b>')).toBeTruthy();
    fireEvent.click(screen.getByText('Yes, 8 works!'));
    expect(t.assistantBar.use).toHaveBeenCalledExactlyOnceWith(0);
    const [, second] = screen.getAllByRole('button', { name: 'Send this suggestion now' });
    if (second === undefined) {
      throw new Error('Each suggestion has a send button.');
    }
    fireEvent.click(second);
    expect(t.assistantBar.send).toHaveBeenCalledExactlyOnceWith(1);
  });

  it('asks for a message in the user’s words on Enter, then clears the field', async () => {
    const t = setup();
    const field = await screen.findByRole<HTMLInputElement>('textbox', { name: 'Write a message' });
    const form = field.closest('form');
    if (form === null) {
      throw new Error('The field sits in a form.');
    }
    fireEvent.submit(form);
    expect(t.assistantBar.prompt).not.toHaveBeenCalled();
    fireEvent.input(field, { target: { value: 'Tell her I’ll be late' } });
    fireEvent.submit(form);
    expect(t.assistantBar.prompt).toHaveBeenCalledExactlyOnceWith('Tell her I’ll be late');
    expect(field.value).toBe('');
  });

  it('answers the extension’s question, and waits while it works', async () => {
    const t = setup();
    await screen.findByText('From AI assistant');
    t.push({ confirm: 'Allow here', status: 'Off in this chat.' });
    fireEvent.click(screen.getByRole('button', { name: 'Allow here' }));
    expect(t.assistantBar.confirm).toHaveBeenCalledOnce();
    t.push({ working: true });
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Suggest replies' }).disabled,
    ).toBe(true);
    expect(screen.getByRole<HTMLInputElement>('textbox').disabled).toBe(true);
  });

  it('shows nothing without an extension, and keeps a pushed state over a late first answer', async () => {
    let answer: (state: AssistantBarState) => void = () => undefined;
    const t = setup(() => new Promise((resolve) => (answer = resolve)));
    expect(document.body.textContent).toBe('');
    t.push({ extension: 'Pushed' });
    await act(() => {
      answer(STATE);
    });
    expect(screen.getByText('From Pushed')).toBeTruthy();
    t.push({ extension: '' });
    expect(document.body.textContent).toBe('');
  });

  it('stays empty when the state cannot be read', async () => {
    setup(() => Promise.reject(new Error('gone')));
    await act(() => Promise.resolve());
    expect(document.body.textContent).toBe('');
  });
});
