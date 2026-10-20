import { describe, expect, it } from 'vitest';
import { buildAboutInfo, formatTechnicalDetails, readInstallChannel } from './about-info.ts';

const FACTS = {
  version: '0.1.0',
  channel: 'flatpak',
  versions: { electron: '44.9.0', chrome: '152.0.7977.167', node: '24.22.0' },
  platform: 'linux',
  release: '7.0.0',
  arch: 'x64',
  graphics: 'hardware accelerated',
};

describe('buildAboutInfo', () => {
  it('collects the version, channel, engines, OS and license', () => {
    expect(buildAboutInfo(FACTS)).toEqual({
      name: 'YapYap',
      version: '0.1.0',
      channel: 'flatpak',
      electron: '44.9.0',
      chromium: '152.0.7977.167',
      node: '24.22.0',
      os: 'linux 7.0.0 (x64)',
      license: 'MIT',
      graphics: 'hardware accelerated',
    });
  });

  it('says unknown for engine versions outside Electron', () => {
    const info = buildAboutInfo({ ...FACTS, versions: { node: '24.22.0' } });
    expect([info.electron, info.chromium]).toEqual(['unknown', 'unknown']);
  });
});

describe('formatTechnicalDetails', () => {
  it('produces plain text for bug reports', () => {
    expect(formatTechnicalDetails(buildAboutInfo(FACTS))).toBe(
      [
        'YapYap 0.1.0 (flatpak)',
        'Electron 44.9.0',
        'Chromium 152.0.7977.167',
        'Node.js 24.22.0',
        'OS linux 7.0.0 (x64)',
        'Graphics hardware accelerated',
      ].join('\n'),
    );
  });
});

describe('readInstallChannel', () => {
  it('reads the channel packaging stamped into package.json', () => {
    expect(readInstallChannel(() => '{"name":"yapyap","installChannel":"appimage"}')).toBe(
      'appimage',
    );
  });

  it.each(['{}', '{"installChannel":""}', '{"installChannel":7}', 'null', '"text"', 'not json'])(
    'falls back to development for %j',
    (packageJson) => {
      expect(readInstallChannel(() => packageJson)).toBe('development');
    },
  );

  it('falls back to development when there is no package.json', () => {
    expect(
      readInstallChannel(() => {
        throw new Error('ENOENT');
      }),
    ).toBe('development');
  });
});
