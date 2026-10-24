import type { Settings } from '../settings/schema.ts';
import type { SettingsService } from '../settings/service.ts';

/** Electron's proxy configuration, as far as YapYap uses it. */
type ProxyConfig =
  | { readonly mode: 'system' }
  | { readonly mode: 'direct' }
  | { readonly mode: 'pac_script'; readonly pacScript: string }
  | {
      readonly mode: 'fixed_servers';
      readonly proxyRules: string;
      readonly proxyBypassRules?: string;
    };

export interface ProxiedSession {
  setProxy(config: ProxyConfig): Promise<void>;
  /** Drops connections made under the old setting, so none outlives a change. */
  closeAllConnections(): Promise<void>;
}

/** How WebRTC may pick network paths (Electron's `setWebRTCIPHandlingPolicy`). */
export type WebRtcPolicy = 'default_public_interface_only' | 'disable_non_proxied_udp';

export interface WebRtcPage {
  setWebRTCIPHandlingPolicy(policy: WebRtcPolicy): void;
}

/**
 * Where nothing can go: a closed port on this computer. A proxy setting that
 * cannot be used blocks connections instead of letting them go direct.
 */
const BLOCKED: ProxyConfig = { mode: 'fixed_servers', proxyRules: 'http://127.0.0.1:1' };

/** Chromium's command line, which can name a proxy for one launch. */
export interface ProxySwitches {
  hasSwitch(name: string): boolean;
  getSwitchValue(name: string): string;
}

/**
 * What following the system means for this launch. Chromium's own proxy
 * switches win over the system's settings, as in any Chromium browser, and
 * the system mode would silently drop them.
 */
export function launchProxyOf(switches: ProxySwitches): ProxyConfig {
  if (switches.hasSwitch('no-proxy-server')) {
    return { mode: 'direct' };
  }
  const pac = switches.getSwitchValue('proxy-pac-url');
  if (pac !== '') {
    return { mode: 'pac_script', pacScript: pac };
  }
  const server = switches.getSwitchValue('proxy-server');
  if (server === '') {
    return { mode: 'system' };
  }
  const bypass = switches.getSwitchValue('proxy-bypass-list');
  return {
    mode: 'fixed_servers',
    proxyRules: server,
    ...(bypass === '' ? {} : { proxyBypassRules: bypass }),
  };
}

export function proxyConfigOf(
  { proxyMode, proxyServer }: Settings['network'],
  launch: ProxyConfig,
): ProxyConfig {
  if (proxyMode === 'system') {
    return launch;
  }
  if (proxyMode === 'direct') {
    return { mode: 'direct' };
  }
  return proxyServer === '' ? BLOCKED : { mode: 'fixed_servers', proxyRules: proxyServer };
}

/**
 * Calls must not reveal the real address around a manual proxy, so WebRTC
 * then sends only through it, which may leave calls to relays. Otherwise
 * WebRTC still keeps local addresses private (ADR 0008, C23).
 */
export function webRtcPolicyOf(network: Settings['network']): WebRtcPolicy {
  return network.proxyMode === 'manual'
    ? 'disable_non_proxied_udp'
    : 'default_public_interface_only';
}

async function applyTo(
  session: ProxiedSession,
  config: ProxyConfig,
  warn: (message: string) => void,
): Promise<void> {
  try {
    await session.setProxy(config);
  } catch {
    // The proxy address is not logged: it can name a private host.
    warn('Could not apply the proxy setting; connections stay blocked until it works.');
    await session.setProxy(BLOCKED).catch(() => undefined);
  }
}

export interface ProxyController {
  /** Applies the setting to a session; resolves once its loads may start. */
  readonly guard: (session: ProxiedSession) => Promise<void>;
}

/** Keeps every account's session on the proxy the settings name, through every change (#76). */
export function followProxySetting(
  settings: Pick<SettingsService, 'current' | 'onChange'>,
  warn: (message: string) => void,
  launch: ProxyConfig,
): ProxyController {
  const sessions = new Set<ProxiedSession>();
  settings.onChange((current) => {
    const config = proxyConfigOf(current.network, launch);
    for (const session of sessions) {
      void applyTo(session, config, warn).then(() => session.closeAllConnections());
    }
  });
  return {
    guard: (session) => {
      sessions.add(session);
      return applyTo(session, proxyConfigOf(settings.current().network, launch), warn);
    },
  };
}

/** Keeps a page's WebRTC policy in step with the proxy setting. */
export function followWebRtcPolicy(
  page: WebRtcPage,
  settings: Pick<SettingsService, 'current' | 'onChange'>,
): void {
  const apply = (current: Settings): void => {
    page.setWebRTCIPHandlingPolicy(webRtcPolicyOf(current.network));
  };
  apply(settings.current());
  settings.onChange(apply);
}
