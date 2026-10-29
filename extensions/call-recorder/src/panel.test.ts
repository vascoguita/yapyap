/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { length, mountPanel, REFRESH_MS, type PanelPort } from './panel.ts';

const RECORDING = { id: 'c'.repeat(32), started: '2026-10-29T10:00:00.000Z', durationMs: 65_000 };

function setup() {
  const sent: unknown[] = [];
  const port: PanelPort = {
    postMessage: (message) => sent.push(message),
    onmessage: null,
  };
  const every = vi.fn();
  mountPanel(document, port, every);
  const news = (data: unknown): void => {
    port.onmessage?.({ data } as MessageEvent);
  };
  const button = (name: string): HTMLButtonElement => {
    const found = [...document.querySelectorAll('button')].find((b) => b.textContent === name);
    if (found === undefined) {
      throw new Error(`No ${name} button.`);
    }
    return found;
  };
  return { sent, every, news, button };
}

const status = (overrides: object) => ({
  type: 'status',
  supported: true,
  call: false,
  recordingSince: null,
  recordings: [],
  ...overrides,
});

afterEach(() => {
  document.body.replaceChildren();
});

describe('length', () => {
  it('writes minutes and seconds, and hours for a long call', () => {
    expect(length(5_000)).toBe('0:05');
    expect(length(65_000)).toBe('1:05');
    expect(length(3_725_000)).toBe('1:02:05');
  });
});

describe('mountPanel', () => {
  it('asks for the status at once and again every few seconds, and warns about consent', () => {
    const t = setup();
    expect(t.sent).toEqual([{ type: 'status?' }]);
    const [ask, ms] = t.every.mock.calls[0] as [() => void, number];
    expect(ms).toBe(REFRESH_MS);
    ask();
    expect(t.sent).toHaveLength(2);
    expect(document.body.textContent).toContain('Ask everyone on the call before you record it.');
    expect(t.button('Record').disabled).toBe(true);
  });

  it('offers Record only during a call, and Stop only while recording', () => {
    const t = setup();
    t.news(status({}));
    expect(document.querySelector('output')?.textContent).toBe('No call is running.');
    expect(document.body.textContent).toContain('No recordings yet.');
    t.news(status({ call: true }));
    expect(document.querySelector('output')?.textContent).toBe('A call is running.');
    expect(t.button('Record').disabled).toBe(false);
    expect(t.button('Stop').disabled).toBe(true);
    t.button('Record').click();
    expect(t.sent.at(-1)).toEqual({ type: 'record' });
    t.news(status({ call: true, recordingSince: RECORDING.started }));
    expect(document.querySelector('output')?.textContent).toMatch(/^Recording since /);
    expect(t.button('Record').disabled).toBe(true);
    t.button('Stop').click();
    expect(t.sent.at(-1)).toEqual({ type: 'stop' });
  });

  it('says when this system cannot record, and offers nothing', () => {
    const t = setup();
    t.news(status({ supported: false, call: true }));
    expect(document.querySelector('output')?.textContent).toBe(
      'YapYap cannot record calls on this system yet.',
    );
    expect(t.button('Record').disabled).toBe(true);
  });

  it('lists the recordings, each shown in its folder on request, and ignores odd messages', () => {
    const t = setup();
    t.news(status({ recordings: [RECORDING] }));
    expect(document.querySelector('li')?.textContent).toContain('1:05');
    t.button('Show in folder').click();
    expect(t.sent.at(-1)).toEqual({ type: 'reveal', id: RECORDING.id });
    t.news({ type: 'status' });
    expect(document.querySelectorAll('li')).toHaveLength(1);
  });
});
