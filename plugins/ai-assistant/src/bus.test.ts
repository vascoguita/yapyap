import { describe, expect, it } from 'vitest';
import { assistantState, panelRequest } from './bus.ts';

describe('panelRequest', () => {
  it('takes the panel’s three requests, with a trimmed key, and nothing else', () => {
    expect(panelRequest({ type: 'state?' })).toEqual({ type: 'state?' });
    expect(panelRequest({ type: 'forget-key', key: 'x' })).toEqual({ type: 'forget-key' });
    expect(panelRequest({ type: 'save-key', key: ' sk-1 ' })).toEqual({
      type: 'save-key',
      key: 'sk-1',
    });
    expect(panelRequest({ type: 'save-key', key: 'k'.repeat(8192) })).toBeDefined();
    for (const data of [
      { type: 'save-key', key: 'k'.repeat(8193) },
      { type: 'save-key', key: '  ' },
      { type: 'save-key', key: 7 },
      { type: 'send', key: 'x' },
      null,
      'state?',
    ]) {
      expect(panelRequest(data)).toBeUndefined();
    }
  });
});

describe('assistantState', () => {
  it('takes only the hidden page’s state', () => {
    const state = { type: 'state', provider: 'openai', model: 'm', missing: '' };
    expect(assistantState(state)).toEqual(state);
    expect(assistantState({ ...state, type: 'other' })).toBeUndefined();
    expect(assistantState({ ...state, provider: 1 })).toBeUndefined();
    expect(assistantState({ ...state, model: null })).toBeUndefined();
    expect(assistantState({ ...state, missing: false })).toBeUndefined();
  });
});
