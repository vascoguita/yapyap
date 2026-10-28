import { describe, expect, it } from 'vitest';
import { extensionLinkInArguments, extensionLinkTarget } from './extension-link.ts';

describe('extensionLinkTarget', () => {
  it('reads the extension ID of an install link', () => {
    expect(extensionLinkTarget('yapyap://extensions/install/org.example.hello')).toBe(
      'org.example.hello',
    );
    expect(extensionLinkTarget('yapyap://extensions/install/org.guita.yapyap.ai-assistant')).toBe(
      'org.guita.yapyap.ai-assistant',
    );
  });

  it.each([
    'yapyap://extensions/install/',
    'yapyap://extensions/install/hello',
    'yapyap://extensions/install/org.example.hello/1.0.0',
    'yapyap://extensions/install/org.example.hello?url=https://evil.example/x.yapyap-extension',
    'yapyap://extensions/install/org.example.hello#x',
    'yapyap://extensions/install/../../etc/passwd',
    'yapyap://extensions/install/org.example.%2e%2e',
    'yapyap://extensions/install/Org.Example.Hello',
    'yapyap://extensions/remove/org.example.hello',
    'yapyap://user:secret@extensions/install/org.example.hello',
    'YAPYAP://extensions/install/org.example.hello',
    'https://yapyap.guita.org/extensions/install/org.example.hello',
    'whatsapp://send?phone=447700900123',
    `yapyap://extensions/install/org.example.${'a'.repeat(200)}`,
  ])('refuses %s', (link) => {
    expect(extensionLinkTarget(link)).toBeUndefined();
  });
});

describe('extensionLinkInArguments', () => {
  it('finds the first install link among other arguments', () => {
    expect(
      extensionLinkInArguments([
        '/usr/bin/yapyap',
        '--flag',
        'yapyap://extensions/install/bad',
        'yapyap://extensions/install/org.example.hello',
        'yapyap://extensions/install/org.example.other',
      ]),
    ).toBe('org.example.hello');
    expect(extensionLinkInArguments(['/usr/bin/yapyap'])).toBeUndefined();
  });
});
