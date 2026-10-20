import { describe, expect, it, vi } from 'vitest';
import {
  chromeUserAgent,
  majorVersion,
  presentAsChrome,
  rewriteClientHints,
  withChromeBrand,
} from './user-agent.ts';

const VERSION = '152.0.7977.167';

describe('chromeUserAgent', () => {
  it.each([
    ['win32', 'Windows NT 10.0; Win64; x64'],
    ['darwin', 'Macintosh; Intel Mac OS X 10_15_7'],
    ['linux', 'X11; Linux x86_64'],
    ['freebsd', 'X11; Linux x86_64'],
  ])('matches desktop Chrome on %s', (platform, os) => {
    expect(chromeUserAgent(platform, VERSION)).toBe(
      `Mozilla/5.0 (${os}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36`,
    );
  });

  it('has no Electron or app tokens', () => {
    expect(chromeUserAgent('linux', VERSION)).not.toMatch(/Electron|YapYap/i);
  });
});

describe('majorVersion', () => {
  it('takes the first component', () => {
    expect(majorVersion(VERSION)).toBe('152');
    expect(majorVersion('153')).toBe('153');
  });
});

describe('withChromeBrand', () => {
  it('adds Google Chrome to the brand list', () => {
    expect(withChromeBrand('"Chromium";v="152", "Not)A;Brand";v="24"', '152')).toBe(
      '"Google Chrome";v="152", "Chromium";v="152", "Not)A;Brand";v="24"',
    );
  });

  it('leaves a list that already names Google Chrome alone', () => {
    const header = '"Google Chrome";v="152", "Chromium";v="152"';
    expect(withChromeBrand(header, '152')).toBe(header);
  });
});

describe('rewriteClientHints', () => {
  it('rewrites the brand lists with the right version detail and keeps other headers', () => {
    expect(
      rewriteClientHints(
        {
          'sec-ch-ua': '"Chromium";v="152"',
          'Sec-CH-UA-Full-Version-List': `"Chromium";v="${VERSION}"`,
          'sec-ch-ua-platform': '"Linux"',
          Accept: 'text/html',
        },
        VERSION,
      ),
    ).toEqual({
      'sec-ch-ua': '"Google Chrome";v="152", "Chromium";v="152"',
      'Sec-CH-UA-Full-Version-List': `"Google Chrome";v="${VERSION}", "Chromium";v="${VERSION}"`,
      'sec-ch-ua-platform': '"Linux"',
      Accept: 'text/html',
    });
  });
});

describe('presentAsChrome', () => {
  it('sets the user agent and rewrites client hints on every request', () => {
    let listener: Parameters<
      Parameters<typeof presentAsChrome>[0]['webRequest']['onBeforeSendHeaders']
    >[0] = () => undefined;
    const session = {
      setUserAgent: vi.fn(),
      webRequest: {
        onBeforeSendHeaders: vi.fn((l: typeof listener) => {
          listener = l;
        }),
      },
    };
    presentAsChrome(session, { userAgent: 'UA', chromeVersion: VERSION });
    expect(session.setUserAgent).toHaveBeenCalledExactlyOnceWith('UA');
    const callback = vi.fn();
    listener({ requestHeaders: { 'sec-ch-ua': '"Chromium";v="152"' } }, callback);
    expect(callback).toHaveBeenCalledExactlyOnceWith({
      requestHeaders: { 'sec-ch-ua': '"Google Chrome";v="152", "Chromium";v="152"' },
    });
  });
});
