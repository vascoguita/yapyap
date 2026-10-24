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
    const listen = vi.fn();
    const api = createChromeBridge(invoke, listen);
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
    expect(await api.accounts.permissions('a')).toBe('ignored');
    expect(await api.accounts.forgetPermissions('a')).toBe('ignored');
    expect(await api.sidebar.state()).toBe('ignored');
    await api.sidebar.switchTo('a');
    await api.sidebar.setCompact(true);
    await api.sidebar.stopSharing('a');
    expect(await api.plugins.list()).toBe('ignored');
    expect(await api.plugins.consent()).toBe('ignored');
    await api.plugins.answer(true, false);
    expect(await api.shortcuts.list()).toBe('ignored');
    expect(await api.report.diagnostics()).toBe('ignored');
    await api.report.open('It froze.');
    const chosen = ['pt-PT'];
    expect(await api.spelling.languages()).toBe('ignored');
    expect(await api.spelling.choose(chosen)).toBe('ignored');
    const listener = vi.fn();
    api.sidebar.onState(listener);
    expect(listen).toHaveBeenCalledWith(listener);
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
      ['accounts:permissions', 'a'],
      ['accounts:forget-permissions', 'a'],
      ['sidebar:state'],
      ['sidebar:switch', 'a'],
      ['sidebar:set-compact', true],
      ['sidebar:stop-sharing', 'a'],
      ['plugins:list'],
      ['plugins:consent'],
      ['plugins:answer', true, false],
      ['shortcuts:list'],
      ['report:diagnostics'],
      ['report:open', 'It froze.'],
      ['spelling:languages'],
      ['spelling:choose', ['pt-PT']],
    ]);
    // The list sent is a copy, never the page's own array.
    expect(invoke.mock.calls.at(-1)?.[1]).not.toBe(chosen);
  });

  it('exposes nothing but the listed operations', () => {
    const api = createChromeBridge(vi.fn(), vi.fn());
    expect(Object.keys(api)).toEqual([
      'about',
      'recovery',
      'settings',
      'chat',
      'accounts',
      'sidebar',
      'plugins',
      'report',
      'spelling',
      'picker',
      'shortcuts',
    ]);
    expect(Object.keys(api.report)).toEqual(['diagnostics', 'open']);
    expect(Object.keys(api.sidebar)).toEqual([
      'state',
      'switchTo',
      'setCompact',
      'stopSharing',
      'onState',
    ]);
    expect(Object.keys(api.plugins)).toEqual(['list', 'consent', 'answer']);
    expect(Object.keys(api.chat)).toEqual(['openNumber']);
    expect(Object.keys(api.shortcuts)).toEqual(['list']);
    expect(Object.keys(api.spelling)).toEqual(['languages', 'choose']);
    expect(Object.keys(api.accounts)).toEqual([
      'list',
      'save',
      'remove',
      'permissions',
      'forgetPermissions',
    ]);
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
