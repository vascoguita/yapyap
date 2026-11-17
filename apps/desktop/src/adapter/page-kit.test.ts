/** @vitest-environment happy-dom */
import { describe, expect, it } from 'vitest';
import { paintWhatsAppTheme, shadowPart, strokeIcon } from './page-kit.ts';

describe('shadowPart', () => {
  it('gives a part its class, and a button its action and button type', () => {
    const parent = document.createElement('div');
    const part = shadowPart(document, 'span', 'text', parent) as HTMLElement;
    const button = shadowPart(document, 'button', 'icon', parent, 'dismiss') as HTMLElement;
    expect([...parent.children]).toEqual([part, button]);
    expect(part.outerHTML).toBe('<span class="text"></span>');
    expect(button.getAttribute('class')).toBe('icon');
    expect(button.dataset['action']).toBe('dismiss');
    expect(button.getAttribute('type')).toBe('button');
  });
});

describe('strokeIcon', () => {
  it('draws a path on a 24 px grid, hidden from screen readers, with a class when given one', () => {
    const icon = strokeIcon(document, 'M1 1z', 'mark') as SVGElement;
    expect(icon.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(icon.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(icon.getAttribute('aria-hidden')).toBe('true');
    expect(icon.getAttribute('class')).toBe('mark');
    expect(icon.firstElementChild?.getAttribute('d')).toBe('M1 1z');
    expect((strokeIcon(document, 'M2 2z') as SVGElement).hasAttribute('class')).toBe(false);
  });
});

describe('paintWhatsAppTheme', () => {
  it('reads a dark theme from light text, and a light one from dark text or a color it cannot read', () => {
    const host = document.createElement('div');
    const paint = (color: string) => {
      paintWhatsAppTheme({ getComputedStyle: () => ({ color }) }, host, host);
      return host.dataset['theme'];
    };
    expect(paint('rgb(233, 237, 239)')).toBe('dark');
    expect(paint('rgba(250, 250, 250, 0.5)')).toBe('dark');
    expect(paint('rgb(17, 27, 33)')).toBe('light');
    // Just at the middle grey still reads as dark text.
    expect(paint('rgb(128, 128, 128)')).toBe('light');
    expect(paint('rgb(129, 129, 129)')).toBe('dark');
    // Green weighs most, then red, then blue.
    expect(paint('rgb(0, 220, 0)')).toBe('dark');
    expect(paint('rgb(255, 0, 0)')).toBe('light');
    expect(paint('rgb(0, 0, 255)')).toBe('light');
    expect(paint('rgb(100, 100, 255)')).toBe('light');
    expect(paint('rgb(120, 140, 255)')).toBe('dark');
    expect(paint('rgb(255, 140, 40)')).toBe('dark');
    expect(paint('')).toBe('light');
    expect(paint('rgb(250)')).toBe('light');
    expect(paint('rgb(250, 250)')).toBe('dark');
  });

  it('reads the color of the node it is given, with the scope as the window', () => {
    const host = document.createElement('div');
    const row = document.createElement('div');
    const scope: Record<string, unknown> = {
      getComputedStyle(this: unknown, node: unknown) {
        expect(this).toBe(scope);
        return { color: node === row ? 'rgb(233, 237, 239)' : 'rgb(0, 0, 0)' };
      },
    };
    paintWhatsAppTheme(scope, host, row);
    expect(host.dataset['theme']).toBe('dark');
  });
});
