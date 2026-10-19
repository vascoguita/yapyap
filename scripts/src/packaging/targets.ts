type InstallChannel = 'appimage' | 'deb' | 'rpm' | 'nsis' | 'portable' | 'dmg';

export interface BuildJob {
  readonly channel: InstallChannel;
  readonly args: readonly string[];
}

const LINUX_ARCH: Readonly<Record<string, string>> = { x64: '--x64', arm64: '--arm64' };

function job(channel: InstallChannel, platformArgs: readonly string[]): BuildJob {
  // Each target is packaged separately so the build can stamp which install
  // channel it is; the update policy reads this marker at runtime (ADR 0003).
  return {
    channel,
    args: [...platformArgs, '--publish', 'never', `-c.extraMetadata.installChannel=${channel}`],
  };
}

/** The electron-builder invocations that produce every package format for this host. */
export function buildJobs(platform: string, arch: string): BuildJob[] {
  if (platform === 'linux') {
    const archFlag = LINUX_ARCH[arch];
    if (archFlag === undefined) throw new Error(`Unsupported Linux architecture: ${arch}`);
    return [
      job('appimage', ['--linux', 'AppImage', archFlag]),
      job('deb', ['--linux', 'deb', archFlag]),
      job('rpm', ['--linux', 'rpm', archFlag]),
    ];
  }
  if (platform === 'win32') {
    return [
      job('nsis', ['--win', 'nsis', '--x64', '--arm64']),
      job('portable', ['--win', 'portable', '--x64', '--arm64']),
    ];
  }
  if (platform === 'darwin') return [job('dmg', ['--mac', 'dmg', 'zip', '--universal'])];
  throw new Error(`Unsupported platform: ${platform}`);
}

/** pnpm is a `.cmd` shim on Windows, which only runs through a shell. */
export function needsShell(platform: string): boolean {
  return platform === 'win32';
}
