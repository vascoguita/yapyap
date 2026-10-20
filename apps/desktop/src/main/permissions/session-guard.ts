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
      callback: (streams: { video: CaptureSource } | null) => void,
    ) => void,
    options: { useSystemPicker: boolean },
  ): void;
}

export interface DisplayCapturePort {
  /** The web contents that owns a frame, if it still exists. */
  readonly contentsOfFrame: (frame: object) => object | undefined;
  readonly isVisibleAndFocused: (contents: object) => boolean;
  /** Set where the OS offers its own source picker (the PipeWire portal on Wayland). */
  readonly pickWithPortal: (() => Promise<CaptureSource | undefined>) | undefined;
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
  if (mediaTypes.length === 0) return false;
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

function requestHandler(deps: SessionGuardDependencies, grants: Grants) {
  return (
    contents: object | null,
    permission: string,
    callback: (granted: boolean) => void,
    details: RequestDetails,
  ): void => {
    const view = viewOf(deps, contents);
    if (permission === 'openExternal') {
      routeExternal(deps, view, details.externalURL);
      callback(false);
      return;
    }
    const fromHome = isSameOrigin(details.requestingUrl ?? '', view?.home);
    const decision = decidePermission(view?.zone, permission, fromHome);
    if (decision !== 'ask' || view === undefined) {
      callback(decision === 'allow');
      return;
    }
    askOnce(deps, grants, view, details.mediaTypes ?? []).then(callback, () => {
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

/**
 * Screen capture is offered only to a WhatsApp frame on its own origin whose
 * window is visible and focused.
 */
function mayCapture(deps: SessionGuardDependencies, request: DisplayMediaRequest): boolean {
  const { capture } = deps;
  const contents = request.frame === null ? undefined : capture.contentsOfFrame(request.frame);
  if (contents === undefined) return false;
  const view = deps.views.get(contents);
  return (
    view?.zone === 'whatsapp' &&
    isSameOrigin(request.securityOrigin, view.home) &&
    capture.isVisibleAndFocused(contents)
  );
}

/** The user always picks the source; nothing is ever preselected. */
function displayMediaHandler(deps: SessionGuardDependencies) {
  return (
    request: DisplayMediaRequest,
    callback: (streams: { video: CaptureSource } | null) => void,
  ): void => {
    const { capture } = deps;
    if (!mayCapture(deps, request) || capture.pickWithPortal === undefined) {
      callback(null);
      return;
    }
    capture
      .pickWithPortal()
      .then(
        (source) => {
          callback(source === undefined ? null : { video: source });
        },
        () => {
          callback(null);
        },
      )
      .catch(() => {
        deps.warn('A screen-sharing request ended before a source was chosen.');
      });
  };
}

/** Applies the permission policy from ADR 0001 to one session. */
export function guardSession(session: SessionPort, deps: SessionGuardDependencies): void {
  const grants: Grants = new Set();
  session.setPermissionRequestHandler(requestHandler(deps, grants));
  session.setPermissionCheckHandler(checkHandler(deps, grants));
  session.setDevicePermissionHandler(() => false);
  session.setDisplayMediaRequestHandler(displayMediaHandler(deps), {
    useSystemPicker: deps.capture.useSystemPicker,
  });
}
