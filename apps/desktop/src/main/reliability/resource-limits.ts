import type { Settings } from '../settings/schema.ts';

const MB = 1024 * 1024;

export interface SwitchableCommandLine {
  appendSwitch(name: string, value?: string): void;
}

/**
 * Chromium's disk cache size and each page's JavaScript memory limit (#83).
 * Both are read once, at launch, so they take effect after a restart; an
 * invalid stored value has already fallen back to "automatic", which leaves
 * Chromium's own choice.
 */
export function applyResourceLimits(
  commandLine: SwitchableCommandLine,
  { diskCacheMb, jsHeapMb }: Settings['reliability'],
): void {
  if (diskCacheMb !== 'auto') {
    commandLine.appendSwitch('disk-cache-size', String(Number(diskCacheMb) * MB));
  }
  if (jsHeapMb !== 'auto') {
    commandLine.appendSwitch('js-flags', `--max-old-space-size=${jsHeapMb}`);
  }
}
