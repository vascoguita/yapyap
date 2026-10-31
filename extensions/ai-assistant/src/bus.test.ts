import { describe, expect, it } from 'vitest';
import { assistantState, panelRequest, update } from './bus.ts';

describe('panelRequest', () => {
  it('takes the panel’s requests, with a trimmed key, and nothing else', () => {
    for (const type of [
      'state?',
      'forget-key',
      'find-model',
      'prepare',
      'prepare-summary',
      'send',
      'cancel',
    ]) {
      expect(panelRequest({ type, extra: 1 })).toEqual({ type });
    }
    expect(panelRequest({ type: 'save-key', key: ' sk-1 ' })).toEqual({
      type: 'save-key',
      key: 'sk-1',
    });
    expect(panelRequest({ type: 'save-key', key: 'k'.repeat(8192) })).toBeDefined();
    expect(panelRequest({ type: 'allow-chat', allowed: false })).toEqual({
      type: 'allow-chat',
      allowed: false,
    });
    expect(panelRequest({ type: 'use', index: 2 })).toEqual({ type: 'use', index: 2 });
    expect(
      panelRequest({ type: 'prepare-rewrite', style: 'translate', language: ' Greek ' }),
    ).toEqual({ type: 'prepare-rewrite', style: 'translate', language: 'Greek' });
    expect(panelRequest({ type: 'prepare-rewrite', style: 'shorter', language: '' })).toEqual({
      type: 'prepare-rewrite',
      style: 'shorter',
      language: '',
    });
    expect(
      panelRequest({ type: 'prepare-rewrite', style: 'translate', language: '' }),
    ).toBeUndefined();
    expect(panelRequest({ type: 'prepare-rewrite', style: 'louder' })).toBeUndefined();
    for (const data of [
      { type: 'save-key', key: 'k'.repeat(8193) },
      { type: 'save-key', key: '  ' },
      { type: 'save-key', key: 7 },
      { type: 'allow-chat', allowed: 'yes' },
      { type: 'use', index: 1.5 },
      { type: 'send-message', text: 'x' },
      null,
      'state?',
    ]) {
      expect(panelRequest(data)).toBeUndefined();
    }
  });
});

describe('assistantState', () => {
  it('takes only the hidden page’s state', () => {
    const state = { type: 'state', provider: 'openai', model: 'm', missing: '', search: true };
    expect(assistantState(state)).toEqual(state);
    expect(assistantState({ ...state, type: 'other' })).toBeUndefined();
    expect(assistantState({ ...state, provider: 1 })).toBeUndefined();
    expect(assistantState({ ...state, model: null })).toBeUndefined();
    expect(assistantState({ ...state, missing: false })).toBeUndefined();
    expect(assistantState({ ...state, search: 'yes' })).toBeUndefined();
  });
});

describe('update', () => {
  it('takes each kind of news from the hidden page, in its exact shape', () => {
    const preview = {
      type: 'preview',
      chat: 'Ana',
      allowed: true,
      instructions: 'i',
      transcript: 't',
    };
    const news = [
      { type: 'state', provider: 'openai', model: 'm', missing: '', search: false },
      preview,
      { type: 'progress', text: 'Hi' },
      { replace: false, type: 'suggestions', items: ['a', 'b'] },
      { type: 'used' },
      { type: 'summary', text: '- Lunch at 1' },
      { type: 'problem', reason: 'auth' },
    ];
    for (const item of news) {
      expect(update(item)).toEqual(item);
    }
    for (const bad of [
      { ...preview, chat: 1 },
      { ...preview, allowed: 'yes' },
      { ...preview, instructions: null },
      { ...preview, transcript: [] },
      { type: 'progress', text: 1 },
      { replace: false, type: 'suggestions', items: ['a', 2] },
      { type: 'suggestions', items: ['a'] },
      { replace: true, type: 'suggestions', items: 'a' },
      { type: 'problem' },
      { type: 'summary', text: 7 },
      { type: 'other' },
      null,
    ]) {
      expect(update(bad)).toBeUndefined();
    }
  });
});
