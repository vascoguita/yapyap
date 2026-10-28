import { describe, expect, it, vi } from 'vitest';
import { forwardPort } from './forward.ts';

function setup() {
  let deliver: ((event: { readonly ports: readonly MessagePort[] }) => void) | undefined;
  const source = {
    once: vi.fn((_channel: string, listener: typeof deliver) => {
      deliver = listener;
    }),
  };
  const target = { postMessage: vi.fn(), location: { origin: 'extension://org.example.hello' } };
  forwardPort(source, target);
  return { source, target, deliver: (ports: readonly MessagePort[]) => deliver?.({ ports }) };
}

describe('forwardPort', () => {
  it('hands the page the port YapYap sends, once, to its own origin', () => {
    const t = setup();
    expect(t.source.once).toHaveBeenCalledExactlyOnceWith(
      'yapyap:extension-port',
      expect.any(Function),
    );
    const port = {} as MessagePort;
    t.deliver([port, {} as MessagePort]);
    expect(t.target.postMessage).toHaveBeenCalledExactlyOnceWith(
      'yapyap:extension-port',
      'extension://org.example.hello',
      [port],
    );
  });

  it('forwards nothing when no port came', () => {
    const t = setup();
    t.deliver([]);
    expect(t.target.postMessage).not.toHaveBeenCalled();
  });
});
