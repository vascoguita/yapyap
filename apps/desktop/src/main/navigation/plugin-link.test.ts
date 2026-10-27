import { describe, expect, it } from 'vitest';
import { pluginLinkInArguments, pluginLinkTarget } from './plugin-link.ts';

describe('pluginLinkTarget', () => {
  it('reads the plugin ID of an install link', () => {
    expect(pluginLinkTarget('yapyap://plugins/install/org.example.hello')).toBe(
      'org.example.hello',
    );
    expect(pluginLinkTarget('yapyap://plugins/install/org.guita.yapyap.ai-assistant')).toBe(
      'org.guita.yapyap.ai-assistant',
    );
  });

  it.each([
    'yapyap://plugins/install/',
    'yapyap://plugins/install/hello',
    'yapyap://plugins/install/org.example.hello/1.0.0',
    'yapyap://plugins/install/org.example.hello?url=https://evil.example/x.yapyap-plugin',
    'yapyap://plugins/install/org.example.hello#x',
    'yapyap://plugins/install/../../etc/passwd',
    'yapyap://plugins/install/org.example.%2e%2e',
    'yapyap://plugins/install/Org.Example.Hello',
    'yapyap://plugins/remove/org.example.hello',
    'yapyap://user:secret@plugins/install/org.example.hello',
    'YAPYAP://plugins/install/org.example.hello',
    'https://yapyap.guita.org/plugins/install/org.example.hello',
    'whatsapp://send?phone=447700900123',
    `yapyap://plugins/install/org.example.${'a'.repeat(200)}`,
  ])('refuses %s', (link) => {
    expect(pluginLinkTarget(link)).toBeUndefined();
  });
});

describe('pluginLinkInArguments', () => {
  it('finds the first install link among other arguments', () => {
    expect(
      pluginLinkInArguments([
        '/usr/bin/yapyap',
        '--flag',
        'yapyap://plugins/install/bad',
        'yapyap://plugins/install/org.example.hello',
        'yapyap://plugins/install/org.example.other',
      ]),
    ).toBe('org.example.hello');
    expect(pluginLinkInArguments(['/usr/bin/yapyap'])).toBeUndefined();
  });
});
