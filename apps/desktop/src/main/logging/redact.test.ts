import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { redact } from './redact.ts';

const HOME = '/home/maria';

describe('redact', () => {
  it.each([
    ['Saved /home/maria/Downloads/a.pdf', 'Saved ~/Downloads/a.pdf'],
    ['C:\\Users\\maria\\AppData', 'C:\\Users\\maria\\AppData'],
    ['Mail maria.silva+tag@example.co.uk now', 'Mail [email] now'],
    ['Call +351 912 345 678 today', 'Call [phone] today'],
    ['Call (21) 555-0199 ok', 'Call [phone] ok'],
    ['id 351912345678', 'id [phone]'],
    ['Authorization: Bearer abc.def-ghi', 'Authorization: Bearer [token]'],
    ['Authorization: Bearer  spaced-token', 'Authorization: Bearer [token]'],
    ['id deadbeefdeadbeefdeadbeefdeadbeef9', 'id [token]'],
    ['id 9deadbeefdeadbeefdeadbeefdeadbeef', 'id [token]'],
    ['/home/maria/a and /home/maria/b', '~/a and ~/b'],
    ['https://host/p?token=s3cr3t&x=1', 'https://host/p?token=[token]&x=1'],
    ['password=hunter2;', 'password=[token];'],
    ['key a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8', 'key [token]'],
  ])('turns %j into %j', (line, safe) => {
    expect(redact(line, HOME)).toBe(safe);
  });

  it('keeps ordinary diagnostics intact', () => {
    for (const line of [
      'GPU process crashed (reason: crashed, exit code 133)',
      'Electron 44.9.0, Chromium 152.0.7977.167',
      'Rejected an IPC call on settings:set.',
      'Took 1532 ms',
      'Module abcdefghijklmnopqrstuvwxyzabcdefgh loaded',
    ]) {
      expect(redact(line, HOME)).toBe(line);
    }
  });

  it('replaces the home folder on Windows too, and ignores a root home', () => {
    expect(redact('Open C:\\Users\\maria\\x', 'C:\\Users\\maria')).toBe('Open ~\\x');
    expect(redact('/etc/hosts', '/')).toBe('/etc/hosts');
  });

  it('never lets an email address or a long digit run through', () => {
    fc.assert(
      fc.property(
        fc.emailAddress(),
        fc.stringMatching(/^\+?\d{9,15}$/),
        fc.string(),
        (email, phone, filler) => {
          const out = redact(`${filler} ${email} ${filler} ${phone} ${filler}`, HOME);
          expect(out).not.toContain(email);
          expect(out).not.toContain(phone);
        },
      ),
    );
  });
});
