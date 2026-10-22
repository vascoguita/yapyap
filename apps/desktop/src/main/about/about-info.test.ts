import { describe, expect, it } from 'vitest';
import {
  buildAboutInfo,
  formatDiagnostics,
  formatTechnicalDetails,
  readInstallChannel,
  summarizeGpu,
} from './about-info.ts';

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

describe('summarizeGpu', () => {
  it('lists the features that explain rendering problems, in order', () => {
    expect(
      summarizeGpu({ webgl: 'enabled', gpu_compositing: 'disabled_software', other: 'x' }),
    ).toBe(
      'gpu_compositing=disabled_software, rasterization=unknown, video_decode=unknown, webgl=enabled',
    );
  });
});

describe('formatDiagnostics', () => {
  it('adds the GPU summary and recent log to the technical details', () => {
    expect(
      formatDiagnostics(buildAboutInfo(FACTS), ['GPU gpu_compositing=enabled'], ['a', 'b']),
    ).toBe(
      `${formatTechnicalDetails(buildAboutInfo(FACTS))}\nGPU gpu_compositing=enabled\n\nRecent log:\na\nb`,
    );
  });

  it('adds the WhatsApp page line after the GPU summary', () => {
    expect(formatDiagnostics(buildAboutInfo(FACTS), ['GPU x', 'WhatsApp view=chats'], ['a'])).toBe(
      `${formatTechnicalDetails(buildAboutInfo(FACTS))}\nGPU x\nWhatsApp view=chats\n\nRecent log:\na`,
    );
  });

  it('says when the log is empty', () => {
    expect(formatDiagnostics(buildAboutInfo(FACTS), ['GPU x'], [])).toMatch(
      /Recent log:\n\(empty\)$/,
    );
  });
});
