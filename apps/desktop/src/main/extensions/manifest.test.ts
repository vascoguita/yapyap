import { describe, expect, it } from 'vitest';
import { en } from '../../shared/messages/en.ts';
import { testManifest, unsignedArchive } from '../../../test/extensions.ts';
import { checkManifest } from './manifest.ts';

describe('checkManifest', () => {
  it('accepts a manifest that matches the schema and names files the archive holds', () => {
    const manifest = testManifest();
    expect(checkManifest(unsignedArchive(manifest))).toEqual({ valid: true, manifest });
  });

  it('names where the manifest breaks the schema', () => {
    const archive = unsignedArchive(testManifest({ author: 'nobody' }));
    expect(checkManifest(archive)).toEqual({
      valid: false,
      reason: en.extensions.reason.manifestInvalid({ problem: '/author must be object' }),
    });
  });

  it('refuses fields the schema does not define', () => {
    const archive = unsignedArchive({ ...testManifest(), unexpected: true });
    expect(checkManifest(archive)).toEqual({
      valid: false,
      reason: en.extensions.reason.manifestInvalid({ problem: '/unexpected schema is false' }),
    });
  });

  it('reports a problem with the manifest as a whole without a location', () => {
    const missing = unsignedArchive({});
    expect(checkManifest(missing)).toEqual({
      valid: false,
      reason: en.extensions.reason.manifestInvalid({
        problem:
          'must have required properties id, name, version, author, apiVersion, entry, capabilities',
      }),
    });
  });

  it('refuses capabilities the SDK does not define', () => {
    const archive = unsignedArchive(testManifest({ capabilities: ['chat:send'] }));
    expect(checkManifest(archive).valid).toBe(false);
  });

  it('refuses an extension whose entry point is missing', () => {
    const archive = unsignedArchive(testManifest(), { 'other.js': '' });
    expect(checkManifest(archive)).toEqual({
      valid: false,
      reason: en.extensions.reason.missingFile({ file: 'main.js' }),
    });
  });

  it('refuses an extension whose panel entry point is missing', () => {
    const manifest = testManifest({
      contributes: { panel: { title: 'Panel', entry: 'panel.js' } },
    });
    expect(checkManifest(unsignedArchive(manifest))).toEqual({
      valid: false,
      reason: en.extensions.reason.missingFile({ file: 'panel.js' }),
    });
    const complete = unsignedArchive(manifest, { 'main.js': '', 'panel.js': '' });
    expect(checkManifest(complete).valid).toBe(true);
  });
});
