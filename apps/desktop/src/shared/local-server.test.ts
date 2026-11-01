import { describe, expect, it } from 'vitest';
import { isLocalServer, localServerOf } from './local-server.ts';

describe('isLocalServer', () => {
  it('accepts an OpenAI-style address on loopback only', () => {
    expect(isLocalServer('http://localhost:11434/v1')).toBe(true);
    expect(isLocalServer('http://127.0.0.1:1234/v1')).toBe(true);
    expect(isLocalServer('https://[::1]:8080/v1')).toBe(true);
    for (const other of [
      '',
      'http://localhost/v1',
      'http://localhost:0/v1',
      'http://localhost:70000/v1',
      'http://192.168.1.2:11434/v1',
      'http://localhost.example:11434/v1',
      'http://localhost:11434/v1/chat',
      'file://localhost:1/v1',
    ]) {
      expect(isLocalServer(other)).toBe(false);
    }
  });
});

describe('localServerOf', () => {
  it('completes what the user typed into the address the settings keep', () => {
    expect(localServerOf('localhost:11434')).toBe('http://localhost:11434/v1');
    expect(localServerOf(' http://127.0.0.1:1234/ ')).toBe('http://127.0.0.1:1234/v1');
    expect(localServerOf('http://localhost:8080/v1')).toBe('http://localhost:8080/v1');
    expect(localServerOf('example.org:80')).toBeUndefined();
  });
});
