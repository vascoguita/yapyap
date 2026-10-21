import { describe, expect, it } from 'vitest';
import { chatLinkInArguments, chatLinkTarget } from './deep-link.ts';

const HOME = 'https://web.whatsapp.com';

describe('chatLinkTarget', () => {
  it.each([
    [
      'whatsapp://send?phone=351912345678&text=Hi%20there',
      '/send?phone=351912345678&text=Hi+there',
    ],
    ['whatsapp://send?text=Hello', '/send?text=Hello'],
    ['https://wa.me/351912345678', '/send?phone=351912345678'],
    ['https://wa.me/351912345678/?text=Hi', '/send?phone=351912345678&text=Hi'],
    ['https://wa.me/?text=Shared', '/send?text=Shared'],
    [
      'https://api.whatsapp.com/send?phone=351912345678&text=Yo',
      '/send?phone=351912345678&text=Yo',
    ],
    ['https://api.whatsapp.com/send?text=Yo', '/send?text=Yo'],
  ])('opens %s at %s on WhatsApp Web', (link, path) => {
    expect(chatLinkTarget(link, HOME)).toBe(`${HOME}${path}`);
  });

  it('drops every parameter but the phone number and text', () => {
    expect(chatLinkTarget('https://wa.me/351912345678?text=Hi&app_absent=1&x=y', HOME)).toBe(
      `${HOME}/send?phone=351912345678&text=Hi`,
    );
  });

  it('opens on the configured home origin', () => {
    expect(chatLinkTarget('https://wa.me/1', 'http://127.0.0.1:4321')).toBe(
      'http://127.0.0.1:4321/send?phone=1',
    );
  });

  it.each([
    'not a link',
    'https://wa.me/',
    'https://wa.me/abc',
    'https://wa.me/351912345678/extra',
    'https://wa.me/abc/351912345678',
    'https://wa.me.evil.example/351912345678',
    'http://wa.me/351912345678',
    'https://api.whatsapp.com/other?phone=1',
    'https://api.whatsapp.com/send',
    'https://api.whatsapp.com/send?phone=12ab',
    'https://example.com/send?phone=1',
    'https://constructor/?text=x',
    'https://__proto__/?text=x',
    'whatsapp://chat?code=abc',
    'whatsapp://send',
    'whatsapp://send?phone=+1;rm',
    'file:///etc/passwd',
    'javascript:alert(1)',
  ])('rejects %s', (link) => {
    expect(chatLinkTarget(link, HOME)).toBeUndefined();
  });
});

describe('chatLinkInArguments', () => {
  it('finds the first chat link among other arguments', () => {
    expect(
      chatLinkInArguments(
        [
          '/opt/YapYap/yapyap',
          '--no-sandbox-is-ignored',
          'https://wa.me/1',
          'whatsapp://send?text=2',
        ],
        HOME,
      ),
    ).toBe(`${HOME}/send?phone=1`);
  });

  it('finds nothing when no argument is a chat link', () => {
    expect(chatLinkInArguments(['/opt/YapYap/yapyap', '--safe-mode'], HOME)).toBeUndefined();
  });
});
