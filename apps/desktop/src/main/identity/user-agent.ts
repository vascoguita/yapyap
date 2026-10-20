/**
 * Chrome's reduced user agent: only the major version is real, and the OS
 * part is frozen per platform. Matching it exactly keeps WhatsApp from
 * showing its unsupported-browser or "get the app" pages.
 */
const PLATFORM_TOKENS: ReadonlyMap<string, string> = new Map([
  ['win32', 'Windows NT 10.0; Win64; x64'],
  ['darwin', 'Macintosh; Intel Mac OS X 10_15_7'],
]);
const LINUX_TOKEN = 'X11; Linux x86_64';

export function majorVersion(chromeVersion: string): string {
  return chromeVersion.replace(/\..*/, '');
}

export function chromeUserAgent(platform: string, chromeVersion: string): string {
  const os = PLATFORM_TOKENS.get(platform) ?? LINUX_TOKEN;
  return `Mozilla/5.0 (${os}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${majorVersion(chromeVersion)}.0.0.0 Safari/537.36`;
}

/**
 * Electron's client hints name only Chromium; Chrome also names itself.
 * Adds the "Google Chrome" brand to a brand-list header, keeping the rest.
 */
export function withChromeBrand(header: string, version: string): string {
  return header.includes('"Google Chrome"') ? header : `"Google Chrome";v="${version}", ${header}`;
}

const BRAND_HEADERS: ReadonlyMap<string, (chromeVersion: string) => string> = new Map([
  ['sec-ch-ua', majorVersion],
  ['sec-ch-ua-full-version-list', (chromeVersion: string) => chromeVersion],
]);

/** Rewrites the brand-list client hints in a request's headers, whatever their case. */
export function rewriteClientHints(
  headers: Readonly<Record<string, string>>,
  chromeVersion: string,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => {
      const version = BRAND_HEADERS.get(name.toLowerCase());
      return [name, version === undefined ? value : withChromeBrand(value, version(chromeVersion))];
    }),
  );
}

export interface IdentitySession {
  setUserAgent(userAgent: string): void;
  readonly webRequest: {
    onBeforeSendHeaders(
      listener: (
        details: { readonly requestHeaders: Record<string, string> },
        callback: (response: { requestHeaders: Record<string, string> }) => void,
      ) => void,
    ): void;
  };
}

export interface ChromeIdentity {
  readonly userAgent: string;
  readonly chromeVersion: string;
}

/** Makes a session look like the desktop Chrome it is built on. */
export function presentAsChrome(session: IdentitySession, identity: ChromeIdentity): void {
  session.setUserAgent(identity.userAgent);
  session.webRequest.onBeforeSendHeaders((details, callback) => {
    callback({
      requestHeaders: rewriteClientHints(details.requestHeaders, identity.chromeVersion),
    });
  });
}
