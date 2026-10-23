import { describe, expect, it, vi } from 'vitest';
import { createChromeBridge } from './bridge.ts';

describe('createChromeBridge', () => {
  it('maps each operation to its own fixed channel', async () => {
    const info = { name: 'YapYap' };
    const problem = { kind: 'blank', description: 'Blank.' };
    const snapshot = { values: {}, restartPending: false, readOnly: false };
    const answers: Record<string, unknown> = {
      'about:info': info,
      'recovery:problem': problem,
      'settings:get': snapshot,
      'settings:set': snapshot,
      'chat:open-number': true,
    };
    const invoke = vi.fn<(channel: string, ...args: unknown[]) => Promise<unknown>>((channel) =>
      Promise.resolve(answers[channel] ?? 'ignored'),
    );
    const api = createChromeBridge(invoke);
    expect(await api.about.info()).toBe(info);
    await api.about.copyTechnicalDetails();
    expect(await api.recovery.problem()).toBe(problem);
    await api.recovery.retry();
    await api.recovery.clearCache();
    await api.recovery.copyDiagnostics();
    expect(await api.settings.get()).toBe(snapshot);
    expect(await api.settings.set('reliability.hardwareAcceleration', false)).toBe(snapshot);
    await api.settings.restart();
    expect(await api.settings.export()).toBe('ignored');
    expect(await api.settings.import()).toBe('ignored');
    expect(await api.picker.offer()).toBe('ignored');
    await api.picker.choose('screen:1:0', true);
    await api.picker.cancel();
    expect(await api.chat.openNumber('+44 7700 900123')).toBe(true);
    expect(await api.accounts.list()).toBe('ignored');
    const change = { name: 'Work', color: 'blue', enabled: true, muted: false };
    expect(await api.accounts.save('a', change)).toBe('ignored');
    expect(await api.accounts.remove('a')).toBe('ignored');
    expect(invoke.mock.calls).toEqual([
      ['about:info'],
      ['about:copy-technical-details'],
      ['recovery:problem'],
      ['recovery:retry'],
      ['recovery:clear-cache'],
      ['recovery:copy-diagnostics'],
      ['settings:get'],
      ['settings:set', 'reliability.hardwareAcceleration', false],
      ['settings:restart'],
      ['settings:export'],
      ['settings:import'],
      ['picker:offer'],
      ['picker:choose', 'screen:1:0', true],
      ['picker:cancel'],
      ['chat:open-number', '+44 7700 900123'],
      ['accounts:list'],
      ['accounts:save', 'a', { name: 'Work', color: 'blue', enabled: true, muted: false }],
      ['accounts:remove', 'a'],
    ]);
  });

  it('exposes nothing but the listed operations', () => {
    const api = createChromeBridge(vi.fn());
    expect(Object.keys(api)).toEqual([
      'about',
      'recovery',
      'settings',
      'chat',
      'accounts',
      'picker',
    ]);
    expect(Object.keys(api.chat)).toEqual(['openNumber']);
    expect(Object.keys(api.accounts)).toEqual(['list', 'save', 'remove']);
    expect(Object.keys(api.picker)).toEqual(['offer', 'choose', 'cancel']);
    expect(Object.keys(api.settings)).toEqual(['get', 'set', 'restart', 'export', 'import']);
    expect(Object.keys(api.about)).toEqual(['info', 'copyTechnicalDetails']);
    expect(Object.keys(api.recovery)).toEqual([
      'problem',
      'retry',
      'clearCache',
      'copyDiagnostics',
    ]);
  });
});
