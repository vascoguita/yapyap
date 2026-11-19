import { describe, expect, it } from 'vitest';
import { LOGIN_FLAG, startedAtLogin, startsHidden } from './login-launch.ts';

const launch = (argv: readonly string[], platform = 'linux', atLogin = false) => ({
  argv,
  platform,
  wasOpenedAtLogin: () => atLogin,
});

describe('startedAtLogin', () => {
  it('knows a login start by the flag every login entry passes', () => {
    expect(startedAtLogin(launch(['/usr/bin/yapyap', LOGIN_FLAG]))).toBe(true);
    expect(startedAtLogin(launch(['/usr/bin/yapyap']))).toBe(false);
    expect(startedAtLogin(launch(['C:\\YapYap.exe', LOGIN_FLAG], 'win32'))).toBe(true);
  });

  it('asks macOS, whose login items pass no arguments', () => {
    expect(startedAtLogin(launch(['/Applications/YapYap.app'], 'darwin', true))).toBe(true);
    expect(startedAtLogin(launch(['/Applications/YapYap.app'], 'darwin', false))).toBe(false);
    // Elsewhere, only the flag says so.
    expect(startedAtLogin(launch(['/usr/bin/yapyap'], 'linux', true))).toBe(false);
  });
});

describe('startsHidden', () => {
  it('starts hidden only in the background at login, never when the user opens YapYap', () => {
    expect(startsHidden(true, launch(['yapyap', LOGIN_FLAG]))).toBe(true);
    expect(startsHidden(true, launch(['yapyap']))).toBe(false);
    expect(startsHidden(false, launch(['yapyap', LOGIN_FLAG]))).toBe(false);
  });
});
