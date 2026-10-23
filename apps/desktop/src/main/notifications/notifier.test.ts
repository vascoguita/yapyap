import { describe, expect, it, vi } from 'vitest';
import { accountNotifier, type NativeOptions } from './notifier.ts';

function setup(heading?: string) {
  const natives: {
    options: NativeOptions;
    show: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    click: () => void;
  }[] = [];
  let time = 0;
  const deps = {
    create: vi.fn((options: NativeOptions) => {
      let click = (): void => undefined;
      const native = {
        options,
        show: vi.fn(),
        close: vi.fn(),
        on: vi.fn((_event: 'click', listener: () => void) => {
          click = listener;
        }),
        click: () => {
          click();
        },
      };
      natives.push(native);
      return native;
    }),
    isSupported: vi.fn(() => true),
    privacy: vi.fn(() => ({ sender: true, text: true })),
    now: () => time,
    warn: vi.fn(),
  };
  const account = { heading: () => heading, onClick: vi.fn() };
  return {
    deps,
    account,
    natives,
    notifier: accountNotifier(deps, account),
    advance: (ms: number) => {
      time += ms;
    },
  };
}

const request = (id: string, extra: object = {}) => ({ id, title: 'Alice', body: 'Hi', ...extra });

describe('accountNotifier', () => {
  it('shows a notification with the page’s title, text and sound setting', () => {
    const t = setup();
    t.notifier.show(request('1', { silent: true }));
    expect(t.natives[0]?.options).toEqual({ title: 'Alice', body: 'Hi', silent: true });
    expect(t.natives[0]?.show).toHaveBeenCalledOnce();
  });

  it('names the account when there are several', () => {
    const t = setup('Work');
    t.notifier.show(request('1'));
    expect(t.natives[0]?.options.title).toBe('Work: Alice');
  });

  it('hides the sender or the text when the privacy options say so', () => {
    const t = setup('Work');
    t.deps.privacy.mockReturnValueOnce({ sender: false, text: true });
    t.notifier.show(request('1'));
    t.deps.privacy.mockReturnValueOnce({ sender: true, text: false });
    t.notifier.show(request('2'));
    expect(t.natives.map((native) => native.options)).toEqual([
      { title: 'Work: WhatsApp', body: 'Hi', silent: false },
      { title: 'Work: Alice', body: 'New message', silent: false },
    ]);
  });

  it('tells the account which notification was clicked', () => {
    const t = setup();
    t.notifier.show(request('7'));
    t.natives[0]?.click();
    expect(t.account.onClick).toHaveBeenCalledWith('7');
  });

  it('withdraws what WhatsApp closes, and everything on quit', () => {
    const t = setup();
    t.notifier.show(request('1'));
    t.notifier.show(request('2'));
    t.notifier.close('1');
    t.notifier.close(1);
    t.notifier.close('unknown');
    expect(t.natives[0]?.close).toHaveBeenCalledOnce();
    t.notifier.closeAll();
    expect(t.natives[1]?.close).toHaveBeenCalledOnce();
    expect(t.natives[0]?.close).toHaveBeenCalledOnce();
  });

  it('replaces a notification with the same tag', () => {
    const t = setup();
    t.notifier.show(request('1', { tag: 'chat' }));
    t.notifier.show(request('2', { tag: 'other' }));
    t.notifier.show(request('3', { tag: 'chat' }));
    t.notifier.show(request('4'));
    t.notifier.show(request('5'));
    expect(t.natives.map((native) => native.close.mock.calls.length)).toEqual([1, 0, 0, 0, 0]);
  });

  it('keeps long text within limits', () => {
    const t = setup();
    t.notifier.show({ id: '1', title: 'x'.repeat(300), body: 'y'.repeat(1200) });
    expect(t.natives[0]?.options.title).toHaveLength(256);
    expect(t.natives[0]?.options.body).toHaveLength(1000);
    t.notifier.show({ id: '2', title: 'Alice' });
    expect(t.natives[1]?.options).toEqual({ title: 'Alice', body: '', silent: false });
  });

  it.each([
    null,
    'text',
    { id: 1, title: 'Alice' },
    { id: 'x'.repeat(33), title: 'Alice' },
    { id: '1', title: 42 },
    { id: '1', title: 'Alice', body: {} },
    { id: '1', title: 'Alice', tag: 3 },
    { id: '1', title: 'Alice', silent: 'yes' },
  ])('drops a malformed request without logging its content: %j', (malformed) => {
    const t = setup();
    t.notifier.show(malformed);
    expect(t.deps.create).not.toHaveBeenCalled();
    expect(t.deps.warn).toHaveBeenCalledWith('Dropped a malformed notification from WhatsApp.');
  });

  it('shows at most 30 notifications a minute', () => {
    const t = setup();
    for (let index = 0; index < 31; index += 1) {
      t.notifier.show(request(String(index)));
    }
    expect(t.deps.create).toHaveBeenCalledTimes(30);
    expect(t.deps.warn).toHaveBeenCalledWith(
      'Dropped a notification: WhatsApp sent too many at once.',
    );
    t.advance(60_000);
    t.notifier.show(request('later'));
    expect(t.deps.create).toHaveBeenCalledTimes(31);
  });

  it('logs a missing notification service once per outage and tries again later', () => {
    const t = setup();
    t.deps.isSupported.mockReturnValue(false);
    t.notifier.show(request('1'));
    t.notifier.show(request('2'));
    expect(t.deps.warn).toHaveBeenCalledOnce();
    t.deps.isSupported.mockReturnValue(true);
    t.notifier.show(request('3'));
    expect(t.deps.create).toHaveBeenCalledOnce();
    t.deps.isSupported.mockReturnValue(false);
    t.notifier.show(request('4'));
    expect(t.deps.warn).toHaveBeenCalledTimes(2);
  });
});
