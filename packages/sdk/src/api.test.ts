import { describe, expect, it, vi } from 'vitest';
import { definePlugin } from './api.ts';
import * as sdk from './index.ts';

describe('definePlugin', () => {
  it('returns the plugin unchanged, only adding types', () => {
    const plugin = { activate: vi.fn() };
    expect(definePlugin(plugin)).toBe(plugin);
  });
});

describe('the SDK entry point', () => {
  it('exports the runtime values a plugin or YapYap needs', () => {
    expect(Object.keys(sdk).sort()).toEqual([
      'CAPABILITIES',
      'MANIFEST_SCHEMA_ID',
      'MARKETPLACE_INDEX_MAX_BYTES',
      'MARKETPLACE_INDEX_URL',
      'MARKETPLACE_MAX_VALIDITY_MS',
      'MARKETPLACE_SIGNATURE_URL',
      'ManifestSchema',
      'MarketplaceIndexSchema',
      'definePlugin',
      'marketplaceArchiveName',
      'marketplaceArchiveUrl',
    ]);
  });
});
