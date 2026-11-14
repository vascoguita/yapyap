import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { isModelServer, isOnThisComputer, modelServerOf } from './model-server.ts';

describe('isModelServer', () => {
  it('takes https anywhere, and plain http only on this computer and the home network', () => {
    for (const allowed of [
      'http://localhost:11434/v1',
      'http://127.0.0.1:1234/v1',
      'http://[::1]:8080/v1',
      'http://10.0.0.5:11434/v1',
      'http://192.168.1.20:11434/v1',
      'http://172.16.0.2/v1',
      'http://172.31.255.255:8000/v1',
      'http://nas.local:11434/v1',
      'https://api.example.com/v1',
      'https://openrouter.ai/api/v1',
      'https://192.168.1.20:8443/v1',
    ]) {
      expect(isModelServer(allowed), allowed).toBe(true);
    }
  });

  it('refuses plain http beyond the home network, and anything that is no plain address', () => {
    for (const refused of [
      '',
      'http://example.com/v1',
      'http://8.8.8.8/v1',
      'http://172.32.0.1/v1',
      'http://localhost.example:11434/v1',
      'http://local/v1',
      'ftp://localhost:21/v1',
      'https://user:secret@api.example.com/v1',
      'https://api.example.com/v1?key=1',
      'https://api.example.com/v1#top',
      'https://api.example.com/v1/',
      'http://localhost:0/v1',
      'http://localhost:70000/v1',
      'http://10.0.0.300/v1',
      'https://API.example.com/v1',
    ]) {
      expect(isModelServer(refused), refused).toBe(false);
    }
  });

  it('never takes plain http to an address outside the private ranges', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 11, max: 126 }),
        fc.integer({ min: 0, max: 255 }),
        (first, second) => {
          expect(isModelServer(`http://${String(first)}.${String(second)}.1.1/v1`)).toBe(false);
        },
      ),
    );
  });
});

describe('isOnThisComputer', () => {
  it('knows the loopback names from the rest', () => {
    expect(isOnThisComputer('http://localhost:11434/v1')).toBe(true);
    expect(isOnThisComputer('http://127.0.0.1:1234/v1')).toBe(true);
    expect(isOnThisComputer('http://[::1]:8080/v1')).toBe(true);
    expect(isOnThisComputer('http://192.168.1.20:11434/v1')).toBe(false);
    expect(isOnThisComputer('https://api.example.com/v1')).toBe(false);
    expect(isOnThisComputer('nonsense')).toBe(false);
  });
});

describe('modelServerOf', () => {
  it('completes what the user typed into the address the settings keep', () => {
    expect(modelServerOf('localhost:11434')).toBe('http://localhost:11434/v1');
    expect(modelServerOf(' http://127.0.0.1:1234/ ')).toBe('http://127.0.0.1:1234/v1');
    expect(modelServerOf('http://localhost:8080/v1')).toBe('http://localhost:8080/v1');
    expect(modelServerOf('192.168.1.20:11434')).toBe('http://192.168.1.20:11434/v1');
    expect(modelServerOf('NAS.local:11434/v1/')).toBe('http://nas.local:11434/v1');
  });

  it('uses https for an address with no scheme beyond the home network', () => {
    expect(modelServerOf('api.example.com/v1')).toBe('https://api.example.com/v1');
    expect(modelServerOf('openrouter.ai/api/v1')).toBe('https://openrouter.ai/api/v1');
  });

  it('refuses plain http beyond the home network, and what is no address', () => {
    expect(modelServerOf('http://example.com/v1')).toBeUndefined();
    expect(modelServerOf('https://user:pw@example.com')).toBeUndefined();
    expect(modelServerOf('http://[bad')).toBeUndefined();
    expect(modelServerOf('')).toBeUndefined();
  });
});
