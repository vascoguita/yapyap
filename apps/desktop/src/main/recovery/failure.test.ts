import { describe, expect, it } from 'vitest';
import { describeFailure, healthFailure, loadFailure } from './failure.ts';

describe('loadFailure', () => {
  it('reports main-frame load failures', () => {
    expect(loadFailure(-102, 'ERR_CONNECTION_REFUSED', true)).toEqual({
      kind: 'load-failed',
      code: -102,
      description: 'ERR_CONNECTION_REFUSED',
    });
  });

  it('ignores subframes and navigations YapYap cancelled itself', () => {
    expect(loadFailure(-102, 'ERR_CONNECTION_REFUSED', false)).toBeUndefined();
    expect(loadFailure(-3, 'ERR_ABORTED', true)).toBeUndefined();
  });
});

describe('healthFailure', () => {
  it.each([
    [{ unsupported: true, blank: false }, { kind: 'unsupported' }],
    [{ unsupported: true, blank: true }, { kind: 'unsupported' }],
    [{ unsupported: false, blank: true }, { kind: 'blank' }],
    [{ unsupported: false, blank: false }, undefined],
    [undefined, undefined],
  ])('turns %j into %j', (health, failure) => {
    expect(healthFailure(health)).toEqual(failure);
  });
});

describe('describeFailure', () => {
  it('explains each failure without URLs', () => {
    expect(describeFailure({ kind: 'unsupported' })).toBe(
      'WhatsApp reported that this browser is not supported.',
    );
    expect(describeFailure({ kind: 'blank' })).toBe('WhatsApp loaded a blank page.');
    expect(
      describeFailure({
        kind: 'load-failed',
        code: -106,
        description: 'ERR_INTERNET_DISCONNECTED',
      }),
    ).toBe('WhatsApp could not load (ERR_INTERNET_DISCONNECTED, -106).');
  });
});
