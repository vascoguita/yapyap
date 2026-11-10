import { describe, expect, it } from 'vitest';

import { modelsBesideAuto } from './model-choices.ts';

const OPUS = { id: 'claude-opus', label: 'Opus' };
const HAIKU = { id: 'claude-haiku', label: 'Haiku' };

describe('modelsBesideAuto', () => {
  it('leaves out the model Auto names, which Auto already shows', () => {
    expect(modelsBesideAuto([OPUS, HAIKU], HAIKU, 'auto')).toEqual([OPUS]);
  });

  it('keeps that model while it is the saved choice', () => {
    expect(modelsBesideAuto([OPUS, HAIKU], HAIKU, 'claude-haiku')).toEqual([OPUS, HAIKU]);
  });

  it('lists every model while Auto names none', () => {
    expect(modelsBesideAuto([OPUS, HAIKU], null, 'auto')).toEqual([OPUS, HAIKU]);
  });
});
