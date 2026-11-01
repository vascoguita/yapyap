import { describe, expect, it } from 'vitest';
import { CATALOG, catalogOf, modelById, modelFor, sizeText } from './catalog.ts';

const GIB = 1024 ** 3;

describe('CATALOG', () => {
  it('pins each model to a commit, its size and its SHA-256, on Hugging Face over HTTPS', () => {
    for (const model of [CATALOG.standard, CATALOG.small]) {
      expect(model.url).toMatch(
        /^https:\/\/huggingface\.co\/Qwen\/[\w.-]+\/resolve\/[0-9a-f]{40}\/[\w.-]+\.gguf$/,
      );
      expect(model.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(Number.isSafeInteger(model.size)).toBe(true);
    }
    expect(CATALOG.standard.size).toBe(1_117_320_736);
    expect(CATALOG.small.size).toBe(491_400_032);
  });
});

describe('modelFor', () => {
  it('picks the smaller model with too little memory or under 4 cores, and the usual one otherwise', () => {
    expect(modelFor({ memory: 7.6 * GIB, cores: 4 })).toBe(CATALOG.standard);
    expect(modelFor({ memory: 4 * GIB, cores: 8 })).toBe(CATALOG.small);
    expect(modelFor({ memory: 16 * GIB, cores: 2 })).toBe(CATALOG.small);
  });
});

describe('modelById', () => {
  it('finds a model the catalog still lists', () => {
    expect(modelById(CATALOG.small.id)).toBe(CATALOG.small);
    expect(modelById('gone')).toBeUndefined();
    expect(modelById(undefined)).toBeUndefined();
  });
});

describe('catalogOf', () => {
  const model = { url: 'http://127.0.0.1:9/tiny.gguf', size: 9, sha256: 'a'.repeat(64) };
  const env = (value: unknown) => ({ YAPYAP_TEST_BUILT_IN_MODEL: JSON.stringify(value) });

  it('takes the model an unpackaged YapYap is given for tests in place of both', () => {
    const catalog = catalogOf(env(model), false);
    expect(catalog.standard).toEqual({ id: 'test', name: 'Test', ...model });
    expect(catalog.small).toBe(catalog.standard);
  });

  it('keeps the pinned catalog when packaged, without a model, or for anything else', () => {
    expect(catalogOf(env(model), true)).toBe(CATALOG);
    expect(catalogOf({}, false)).toBe(CATALOG);
    expect(catalogOf({ YAPYAP_TEST_BUILT_IN_MODEL: '{' }, false)).toBe(CATALOG);
    for (const bad of [
      null,
      { ...model, url: 1 },
      { ...model, url: 'not a url' },
      { ...model, url: 'file:///etc/passwd' },
      { ...model, size: 0 },
      { ...model, size: 1.5 },
      { ...model, sha256: 1 },
      { ...model, sha256: 'A'.repeat(64) },
    ]) {
      expect(catalogOf(env(bad), false)).toBe(CATALOG);
    }
  });
});

describe('sizeText', () => {
  it('says sizes as people read them', () => {
    expect(sizeText(1_117_320_736)).toBe('1.1 GB');
    expect(sizeText(491_400_032)).toBe('490 MB');
    expect(sizeText(1_185_376)).toBe('1 MB');
  });
});
