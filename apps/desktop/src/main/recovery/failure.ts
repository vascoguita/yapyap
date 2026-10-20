import type { PageHealth } from '../../adapter/page-health.ts';

export type Failure =
  | { readonly kind: 'unsupported' }
  | { readonly kind: 'blank' }
  | { readonly kind: 'crashed' }
  | { readonly kind: 'load-failed'; readonly code: number; readonly description: string };

/** Chromium's error for navigations YapYap cancels itself, such as off-origin links. */
const ABORTED = -3;

export function loadFailure(
  code: number,
  description: string,
  isMainFrame: boolean,
): Failure | undefined {
  return isMainFrame && code !== ABORTED ? { kind: 'load-failed', code, description } : undefined;
}

export function healthFailure(health: PageHealth | undefined): Failure | undefined {
  if (health?.unsupported === true) return { kind: 'unsupported' };
  return health?.blank === true ? { kind: 'blank' } : undefined;
}

/** For diagnostics: Chromium error names only, never URLs. */
export function describeFailure(failure: Failure): string {
  if (failure.kind === 'unsupported')
    return 'WhatsApp reported that this browser is not supported.';
  if (failure.kind === 'blank') return 'WhatsApp loaded a blank page.';
  if (failure.kind === 'crashed') return 'WhatsApp kept stopping unexpectedly.';
  return `WhatsApp could not load (${failure.description}, ${String(failure.code)}).`;
}
