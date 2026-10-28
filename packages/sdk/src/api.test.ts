import { describe, expect, it, vi } from 'vitest';
import { defineExtension } from './api.ts';
import * as sdk from './index.ts';

describe('defineExtension', () => {
  it('returns the extension unchanged, only adding types', () => {
    const extension = { activate: vi.fn() };
    expect(defineExtension(extension)).toBe(extension);
  });
});

describe('the SDK entry point', () => {
  it('exports the runtime values an extension or YapYap needs', () => {
    expect(Object.keys(sdk).sort()).toEqual([
      'CAPABILITIES',
      'MANIFEST_SCHEMA_ID',
      'MARKETPLACE_INDEX_MAX_BYTES',
      'MARKETPLACE_INDEX_URL',
      'MARKETPLACE_MAX_VALIDITY_MS',
      'MARKETPLACE_SIGNATURE_URL',
      'ManifestSchema',
      'MarketplaceIndexSchema',
      'defineExtension',
      'marketplaceArchiveName',
      'marketplaceArchiveUrl',
    ]);
  });
});
