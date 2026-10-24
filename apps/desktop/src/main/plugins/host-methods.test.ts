import { Value } from 'typebox/value';
import { describe, expect, it, vi } from 'vitest';
import { hostMethods } from './host-methods.ts';

describe('hostMethods', () => {
  it('shows a notification that names the plugin, unless Do not disturb is on', async () => {
    const services = { notify: vi.fn(), quiet: vi.fn(() => false) };
    const show = hostMethods({ name: 'Hello' }, services)['notifications.show'];
    expect(show?.capability).toBe('notifications:show');
    await show?.run([{ title: 'Done', body: 'Your draft is ready.' }]);
    expect(services.notify).toHaveBeenCalledExactlyOnceWith('Hello: Done', 'Your draft is ready.');
    services.quiet.mockReturnValue(true);
    await show?.run([{ title: 'Done', body: '' }]);
    expect(services.notify).toHaveBeenCalledOnce();
  });

  it('accepts only a short title and body, and nothing else', () => {
    const show = hostMethods({ name: 'Hello' }, { notify: vi.fn(), quiet: () => false })[
      'notifications.show'
    ];
    const accepts = (params: unknown) => Value.Check(show?.params ?? {}, params);
    expect(accepts([{ title: 'Done', body: '' }])).toBe(true);
    expect(accepts([{ title: '', body: '' }])).toBe(false);
    expect(accepts([{ title: 'x'.repeat(121), body: '' }])).toBe(false);
    expect(accepts([{ title: 'Done', body: 'x'.repeat(1001) }])).toBe(false);
    expect(accepts([{ title: 'Done', body: '', icon: 'https://example.com/' }])).toBe(false);
    expect(accepts([{ title: 'Done', body: '' }, 'more'])).toBe(false);
  });

  it('offers no way to send a message', () => {
    const methods = hostMethods({ name: 'Hello' }, { notify: vi.fn(), quiet: () => false });
    expect(Object.keys(methods)).toEqual(['notifications.show']);
  });
});
