import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { numberedName, safeFileName } from './file-name.ts';

describe('safeFileName', () => {
  it.each([
    ['report.pdf', 'report.pdf'],
    ['Photo.JPG', 'Photo.JPG'],
    ['../../etc/passwd', 'passwd'],
    ['..\\..\\Windows\\System32\\evil.dll', 'evil.dll'],
    ['/absolute/path.txt', 'path.txt'],
    ['a<b>c:d"e|f?g*h.txt', 'a_b_c_d_e_f_g_h.txt'],
    ['tab\there\u0000.txt', 'tab_here_.txt'],
    ['bell\u0007\u007f.txt', 'bell__.txt'],
    ['.bashrc', 'bashrc'],
    ['..hidden', 'hidden'],
    [' ..x', 'x'],
    ['falcon.txt', 'falcon.txt'],
    ['icon.png', 'icon.png'],
    ['...', 'download'],
    ['', 'download'],
    ['   ', 'download'],
    ['..', 'download'],
    ['trailing. . ', 'trailing'],
    ['CON', '_CON'],
    ['con.txt', '_con.txt'],
    ['LPT9.tar.gz', '_LPT9.tar.gz'],
    ['COM0.txt', 'COM0.txt'],
    ['console.log', 'console.log'],
    ['Café.txt', 'Café.txt'],
  ])('turns %j into %j', (suggested, safe) => {
    expect(safeFileName(suggested)).toBe(safe);
  });

  it('shortens long names but keeps the extension', () => {
    const name = safeFileName(`${'a'.repeat(300)}.pdf`);
    expect(Array.from(name)).toHaveLength(200);
    expect(name.endsWith('.pdf')).toBe(true);
    expect(safeFileName('b'.repeat(300))).toBe('b'.repeat(200));
  });

  it('keeps an extension just under half the limit and cuts one at half', () => {
    const kept = safeFileName(`${'s'.repeat(150)}.${'k'.repeat(98)}`);
    expect(kept).toBe(`${'s'.repeat(101)}.${'k'.repeat(98)}`);
    const cut = safeFileName(`${'s'.repeat(150)}.${'c'.repeat(99)}`);
    expect(cut).toBe(`${'s'.repeat(150)}.${'c'.repeat(49)}`);
  });

  it('cuts the whole name when its extension is too long to keep', () => {
    expect(safeFileName(`x.${'e'.repeat(250)}`)).toBe(`x.${'e'.repeat(198)}`);
  });

  it('never splits a character or leaves a trailing dot when it cuts', () => {
    expect(safeFileName(`${'😀'.repeat(250)}.txt`)).toBe(`${'😀'.repeat(196)}.txt`);
    expect(safeFileName(`${'a'.repeat(195)}.....${'b'.repeat(10)}.txt`)).toBe(
      `${'a'.repeat(195)}.txt`,
    );
  });

  it('always gives a plain, visible, bounded name, whatever it is handed', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary', maxLength: 400 }), (suggested) => {
        const name = safeFileName(suggested);
        expect(name.length).toBeGreaterThan(0);
        expect(Array.from(name).length).toBeLessThanOrEqual(200);
        expect(name).not.toMatch(/[<>:"/\\|?*]/);
        const controls = Array.from(name).filter(
          (c) => c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f,
        );
        expect(controls).toEqual([]);
        expect(name.startsWith('.')).toBe(false);
        expect(name).not.toMatch(/[.\s]$/);
        expect(name).not.toMatch(/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i);
      }),
    );
  });
});

describe('numberedName', () => {
  it('numbers before the extension, as browsers do', () => {
    expect(numberedName('photo.jpg', 1)).toBe('photo (1).jpg');
    expect(numberedName('archive.tar.gz', 2)).toBe('archive.tar (2).gz');
    expect(numberedName('README', 3)).toBe('README (3)');
    expect(numberedName('.env', 4)).toBe('.env (4)');
  });
});
