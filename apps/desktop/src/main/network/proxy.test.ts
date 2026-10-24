import { describe, expect, it, vi } from 'vitest';
import { defaultSettings } from '../settings/decode.ts';
import type { Settings } from '../settings/schema.ts';
import {
  followProxySetting,
  followWebRtcPolicy,
  launchProxyOf,
  proxyConfigOf,
  webRtcPolicyOf,
} from './proxy.ts';

const network = (proxyMode: Settings['network']['proxyMode'], proxyServer = '') => ({
  proxyMode,
  proxyServer,
});

const BLOCKED = { mode: 'fixed_servers', proxyRules: 'http://127.0.0.1:1' };
const SYSTEM = { mode: 'system' } as const;

function settingsHolder(initial: Settings['network']) {
  let settings: Settings = { ...defaultSettings(), network: initial };
  const listeners: ((settings: Settings) => void)[] = [];
  return {
    current: () => settings,
    onChange: (listener: (settings: Settings) => void) => {
      listeners.push(listener);
    },
    change: (next: Settings['network']) => {
      settings = { ...settings, network: next };
      for (const listener of listeners) {
        listener(settings);
      }
    },
  };
}

const session = () => ({
  setProxy: vi.fn<(config: unknown) => Promise<void>>(() => Promise.resolve()),
  closeAllConnections: vi.fn(() => Promise.resolve()),
});

const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('proxyConfigOf', () => {
  it('follows the system, goes direct, or uses the proxy named', () => {
    expect(proxyConfigOf(network('system'), SYSTEM)).toEqual({ mode: 'system' });
    expect(proxyConfigOf(network('direct'), SYSTEM)).toEqual({ mode: 'direct' });
    expect(proxyConfigOf(network('manual', 'socks5://127.0.0.1:1080'), SYSTEM)).toEqual({
      mode: 'fixed_servers',
      proxyRules: 'socks5://127.0.0.1:1080',
    });
  });

  it('blocks connections when a manual proxy has no address, rather than going direct', () => {
    expect(proxyConfigOf(network('manual'), SYSTEM)).toEqual(BLOCKED);
  });

  it('lets proxy switches on the command line stand in for the system, and only for it', () => {
    const launch = { mode: 'fixed_servers', proxyRules: 'http://127.0.0.1:9' } as const;
    expect(proxyConfigOf(network('system'), launch)).toBe(launch);
    expect(proxyConfigOf(network('direct'), launch)).toEqual({ mode: 'direct' });
  });
});

describe('launchProxyOf', () => {
  const switches = (values: Record<string, string>) => ({
    hasSwitch: (name: string) => name in values,
    getSwitchValue: (name: string) => values[name] ?? '',
  });

  it('follows the system when the command line names no proxy', () => {
    expect(launchProxyOf(switches({}))).toEqual({ mode: 'system' });
  });

  it('takes Chromium’s proxy switches, as any Chromium browser does', () => {
    expect(launchProxyOf(switches({ 'no-proxy-server': '' }))).toEqual({ mode: 'direct' });
    expect(
      launchProxyOf(switches({ 'proxy-pac-url': 'http://wpad.example.org/proxy.pac' })),
    ).toEqual({
      mode: 'pac_script',
      pacScript: 'http://wpad.example.org/proxy.pac',
    });
    expect(launchProxyOf(switches({ 'proxy-server': 'socks5://127.0.0.1:1080' }))).toEqual({
      mode: 'fixed_servers',
      proxyRules: 'socks5://127.0.0.1:1080',
    });
    expect(
      launchProxyOf(
        switches({ 'proxy-server': 'http://127.0.0.1:3128', 'proxy-bypass-list': '*.example.org' }),
      ),
    ).toEqual({
      mode: 'fixed_servers',
      proxyRules: 'http://127.0.0.1:3128',
      proxyBypassRules: '*.example.org',
    });
  });
});

describe('webRtcPolicyOf', () => {
  it('keeps calls inside a manual proxy, and local addresses private otherwise', () => {
    expect(webRtcPolicyOf(network('manual', 'http://p:8080'))).toBe('disable_non_proxied_udp');
    expect(webRtcPolicyOf(network('system'))).toBe('default_public_interface_only');
    expect(webRtcPolicyOf(network('direct'))).toBe('default_public_interface_only');
  });
});

describe('followProxySetting', () => {
  it('applies the setting to each session before it loads, and again on every change', async () => {
    const settings = settingsHolder(network('system'));
    const proxy = followProxySetting(settings, vi.fn(), SYSTEM);
    const first = session();
    await proxy.guard(first);
    expect(first.setProxy).toHaveBeenCalledWith({ mode: 'system' });
    settings.change(network('manual', 'http://proxy.example.org:3128'));
    await settle();
    expect(first.setProxy).toHaveBeenLastCalledWith({
      mode: 'fixed_servers',
      proxyRules: 'http://proxy.example.org:3128',
    });
    expect(first.closeAllConnections).toHaveBeenCalledOnce();
  });

  it('blocks a session whose proxy could not be applied, saying so without the address', async () => {
    const settings = settingsHolder(network('manual', 'socks5://10.0.0.2:1080'));
    const warn = vi.fn();
    const proxy = followProxySetting(settings, warn, SYSTEM);
    const broken = session();
    broken.setProxy.mockRejectedValueOnce(new Error('bad rules'));
    await proxy.guard(broken);
    expect(broken.setProxy).toHaveBeenLastCalledWith(BLOCKED);
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      'Could not apply the proxy setting; connections stay blocked until it works.',
    );
    const worse = session();
    worse.setProxy.mockRejectedValue(new Error('gone'));
    await expect(proxy.guard(worse)).resolves.toBeUndefined();
  });
});

describe('followWebRtcPolicy', () => {
  it('keeps a page’s WebRTC policy in step with the proxy setting', () => {
    const settings = settingsHolder(network('system'));
    const page = { setWebRTCIPHandlingPolicy: vi.fn() };
    followWebRtcPolicy(page, settings);
    settings.change(network('manual', 'http://p:8080'));
    expect(page.setWebRTCIPHandlingPolicy.mock.calls).toEqual([
      ['default_public_interface_only'],
      ['disable_non_proxied_udp'],
    ]);
  });
});
