import { describe, expect, it } from 'vitest';
import { aboutSize, CATALOG, inMegabytes, modelById, modelFor, testCatalog } from './catalog.ts';

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
  it('picks the smaller model under 8 GB of memory or 4 cores, and the usual one otherwise', () => {
    expect(modelFor({ memoryGb: 8, cores: 4 })).toBe(CATALOG.standard);
    expect(modelFor({ memoryGb: undefined, cores: 8 })).toBe(CATALOG.standard);
    expect(modelFor({ memoryGb: 4, cores: 8 })).toBe(CATALOG.small);
    expect(modelFor({ memoryGb: 16, cores: 2 })).toBe(CATALOG.small);
  });
});

describe('modelById', () => {
  it('finds a model the catalog still lists', () => {
    expect(modelById(CATALOG.small.id)).toBe(CATALOG.small);
    expect(modelById('gone')).toBeUndefined();
    expect(modelById(undefined)).toBeUndefined();
  });
});

describe('testCatalog', () => {
  const model = { url: 'http://127.0.0.1:9/tiny.gguf', size: 9, sha256: 'a'.repeat(64) };

  it('takes the model an unpackaged YapYap serves for tests in place of both', () => {
    const catalog = testCatalog(model);
    expect(catalog?.standard).toEqual({ id: 'test', name: 'Test', ...model });
    expect(catalog?.small).toBe(catalog?.standard);
  });

  it('takes nothing else', () => {
    for (const bad of [
      null,
      { ...model, url: 1 },
      { ...model, url: 'not a url' },
      { ...model, size: 0 },
      { ...model, size: 1.5 },
      { ...model, sha256: 1 },
      { ...model, sha256: 'A'.repeat(64) },
    ]) {
      expect(testCatalog(bad)).toBeUndefined();
    }
  });
});

describe('sizes', () => {
  it('says sizes as people read them', () => {
    expect(aboutSize(1_117_320_736)).toBe('about 1.1 GB');
    expect(aboutSize(491_400_032)).toBe('about 490 MB');
    expect(aboutSize(1_185_376)).toBe('about 1 MB');
    expect(inMegabytes(1_117_320_736)).toBe('1,117');
    expect(inMegabytes(450_000_000)).toBe('450');
  });
});
