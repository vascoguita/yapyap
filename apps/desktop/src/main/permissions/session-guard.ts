import { classifyLink, isSameOrigin } from '../navigation/link-policy.ts';
import type { ViewInfo, ViewRegistry } from '../views.ts';
import { decidePermission } from './permission-policy.ts';

export type MediaType = 'audio' | 'video';

interface RequestDetails {
  readonly requestingUrl?: string;
  readonly mediaTypes?: readonly MediaType[];
  readonly externalURL?: string;
}

interface CheckDetails {
  readonly mediaType?: MediaType | 'unknown';
}

interface DisplayMediaRequest {
  readonly frame: object | null;
  readonly securityOrigin: string;
}

export interface CaptureSource {
  readonly id: string;
  readonly name: string;
}

/** What the user chose to share: a source, plus system audio where they opted in. */
export interface CaptureChoice {
  readonly video: CaptureSource;
  readonly audio?: 'loopback';
}

export interface SessionPort {
  setPermissionRequestHandler(
    handler: (
      contents: object | null,
      permission: string,
      callback: (granted: boolean) => void,
      details: RequestDetails,
    ) => void,
  ): void;
  setPermissionCheckHandler(
    handler: (
      contents: object | null,
      permission: string,
      requestingOrigin: string,
      details: CheckDetails,
    ) => boolean,
  ): void;
  setDevicePermissionHandler(handler: () => boolean): void;
  setDisplayMediaRequestHandler(
    handler: (
      request: DisplayMediaRequest,
      callback: (streams: CaptureChoice | null) => void,
    ) => void,
    options: { useSystemPicker: boolean },
  ): void;
}

export interface DisplayCapturePort {
  /** The web contents that owns a frame, if it still exists. */
  readonly contentsOfFrame: (frame: object) => object | undefined;
  readonly isVisibleAndFocused: (contents: object) => boolean;
  /**
   * Lets the user choose a source for the requesting web contents: the
   * PipeWire portal on Wayland, YapYap's own picker on Windows and X11.
   * Absent where the OS shows its own picker (macOS).
   */
  readonly pick: ((contents: object) => Promise<CaptureChoice | undefined>) | undefined;
  /** macOS 15+ shows its own picker and then never calls the handler. */
  readonly useSystemPicker: boolean;
}

export interface SessionGuardDependencies {
  readonly views: ViewRegistry;
  /** Asks the user, naming the view, whether it may use the camera or microphone. */
  readonly askMedia: (view: ViewInfo, mediaTypes: readonly MediaType[]) => Promise<boolean>;
  readonly openExternal: (url: string) => Promise<unknown>;
  readonly warn: (message: string) => void;
  readonly capture: DisplayCapturePort;
}

type Grants = Set<string>;

/** The source each window's user picked, waiting for the capture it was picked for. */
type Shares = WeakMap<object, CaptureChoice>;

const grantKey = (view: ViewInfo, mediaType: string): string => `${view.label}\u0000${mediaType}`;

function viewOf(deps: SessionGuardDependencies, contents: object | null): ViewInfo | undefined {
  return contents === null ? undefined : deps.views.get(contents);
}

/** Asks only about devices not yet allowed; answers last until the app quits. */
async function askOnce(
  deps: SessionGuardDependencies,
  grants: Grants,
  view: ViewInfo,
  mediaTypes: readonly MediaType[],
): Promise<boolean> {
  const pending = mediaTypes.filter((type) => !grants.has(grantKey(view, type)));
  if (pending.length === 0) return true;
  const allowed = await deps.askMedia(view, pending);
  if (allowed) for (const type of pending) grants.add(grantKey(view, type));
  return allowed;
}

/**
 * External-app launches from any frame bypass `will-navigate`, so they go
 * through the link policy here and Chromium itself is always refused.
 */
function routeExternal(deps: SessionGuardDependencies, view: ViewInfo | undefined, url = ''): void {
  const action = classifyLink(url, view?.home);
  if (action.kind !== 'external') return;
  deps.openExternal(action.url).catch(() => {
    deps.warn('Could not open an external link.');
  });
}

/**
 * A media request with no device types is screen capture, from either
 * `getDisplayMedia` or the legacy desktop `getUserMedia`. Electron cannot
 * tell them apart, and the legacy one captures without ever reaching the
 * display-media handler, so the user picks the source here, before anything
 * is granted. Where the OS shows its own picker (macOS), it guards both.
 */
async function allowScreenCapture(
  deps: SessionGuardDependencies,
  shares: Shares,
  contents: object | null,
  fromHome: boolean,
): Promise<boolean> {
  const { capture } = deps;
  const view = viewOf(deps, contents);
  if (contents === null || view?.zone !== 'whatsapp' || !fromHome) return false;
  if (!capture.isVisibleAndFocused(contents)) return false;
  if (capture.pick === undefined) return capture.useSystemPicker;
  shares.delete(contents);
  const choice = await capture.pick(contents);
  if (choice !== undefined) shares.set(contents, choice);
  return choice !== undefined;
}

const isScreenCapture = (permission: string, mediaTypes: readonly MediaType[]): boolean =>
  permission === 'media' && mediaTypes.length === 0;

function answer(
  deps: SessionGuardDependencies,
  grants: Grants,
  shares: Shares,
  contents: object | null,
  permission: string,
  details: RequestDetails,
): Promise<boolean> {
  const view = viewOf(deps, contents);
  const fromHome = isSameOrigin(details.requestingUrl ?? '', view?.home);
  const mediaTypes = details.mediaTypes ?? [];
  if (isScreenCapture(permission, mediaTypes))
    return allowScreenCapture(deps, shares, contents, fromHome);
  const decision = decidePermission(view?.zone, permission, fromHome);
  if (decision !== 'ask' || view === undefined) return Promise.resolve(decision === 'allow');
  return askOnce(deps, grants, view, mediaTypes);
}

function requestHandler(deps: SessionGuardDependencies, grants: Grants, shares: Shares) {
  return (
    contents: object | null,
    permission: string,
    callback: (granted: boolean) => void,
    details: RequestDetails,
  ): void => {
    if (permission === 'openExternal') {
      routeExternal(deps, viewOf(deps, contents), details.externalURL);
      callback(false);
      return;
    }
    answer(deps, grants, shares, contents, permission, details).then(callback, () => {
      callback(false);
    });
  };
}

function checkHandler(deps: SessionGuardDependencies, grants: Grants) {
  return (
    contents: object | null,
    permission: string,
    requestingOrigin: string,
    details: CheckDetails,
  ): boolean => {
    const view = viewOf(deps, contents);
    const decision = decidePermission(view?.zone, permission, requestingOrigin === view?.home);
    if (decision !== 'ask' || view === undefined) return decision === 'allow';
    return grants.has(grantKey(view, details.mediaType ?? 'unknown'));
  };
}

/** Takes this window's pick, valid only for a WhatsApp frame on its own origin. */
function takeShare(
  deps: SessionGuardDependencies,
  shares: Shares,
  contents: object,
  securityOrigin: string,
): CaptureChoice | undefined {
  const choice = shares.get(contents);
  shares.delete(contents);
  const view = deps.views.get(contents);
  const allowed = view?.zone === 'whatsapp' && isSameOrigin(securityOrigin, view.home);
  return allowed ? choice : undefined;
}

/**
 * Hands over the source the user just picked for this WhatsApp frame's
 * window, once. Nothing is ever chosen here.
 */
function displayMediaHandler(deps: SessionGuardDependencies, shares: Shares) {
  return (
    request: DisplayMediaRequest,
    callback: (streams: CaptureChoice | null) => void,
  ): void => {
    const contents =
      request.frame === null ? undefined : deps.capture.contentsOfFrame(request.frame);
    const choice =
      contents === undefined
        ? undefined
        : takeShare(deps, shares, contents, request.securityOrigin);
    try {
      callback(choice ?? null);
    } catch {
      deps.warn('A screen-sharing request ended before its source could be shared.');
    }
  };
}

/** Applies the permission policy from ADR 0001 to one session. */
export function guardSession(session: SessionPort, deps: SessionGuardDependencies): void {
  const grants: Grants = new Set();
  const shares: Shares = new WeakMap();
  session.setPermissionRequestHandler(requestHandler(deps, grants, shares));
  session.setPermissionCheckHandler(checkHandler(deps, grants));
  session.setDevicePermissionHandler(() => false);
  session.setDisplayMediaRequestHandler(displayMediaHandler(deps, shares), {
    useSystemPicker: deps.capture.useSystemPicker,
  });
}
