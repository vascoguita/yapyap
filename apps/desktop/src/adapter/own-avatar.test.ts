/** @vitest-environment happy-dom */
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it } from 'vitest';
import { OWN_AVATAR, readOwnAvatar } from './own-avatar.ts';
import { LANDMARKS } from './page-state.ts';

const FOOTER = (src: string) =>
  `<div data-testid="navbar-footer-section"><button data-navbar-item="true"><img src="${src}"></button></div>`;

afterEach(() => {
  document.body.innerHTML = '';
});

describe('readOwnAvatar', () => {
  it('reads the photo on the profile button, and only that one', () => {
    document.body.innerHTML = `<div data-testid="cell-frame-container"><img src="https://pps.whatsapp.net/chat.jpg"></div>${FOOTER('https://pps.whatsapp.net/me.jpg')}`;
    expect(readOwnAvatar(document, LANDMARKS.ownAvatar)).toBe('https://pps.whatsapp.net/me.jpg');
  });

  it('reads nothing without the photo, or from an address that is not a web one', () => {
    expect(readOwnAvatar(document, LANDMARKS.ownAvatar)).toBeNull();
    document.body.innerHTML = FOOTER('data:image/png;base64,AAAA');
    expect(readOwnAvatar(document, LANDMARKS.ownAvatar)).toBeNull();
    expect(readOwnAvatar({ querySelector: () => ({}) }, 'x')).toBeNull();
  });

  it.skipIf(OWN_AVATAR.includes('stryMutAct'))('runs as standalone source text', () => {
    document.body.innerHTML = FOOTER('https://pps.whatsapp.net/me.jpg');
    expect(runInNewContext(OWN_AVATAR, { document })).toBe('https://pps.whatsapp.net/me.jpg');
  });
});
