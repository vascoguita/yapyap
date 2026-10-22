import type { AboutInfo } from '../../shared/chrome-api.ts';
import { PRODUCT_NAME } from '../identity.ts';

export interface RuntimeFacts {
  readonly version: string;
  readonly channel: string;
  readonly versions: {
    readonly electron?: string;
    readonly chrome?: string;
    readonly node: string;
  };
  readonly platform: string;
  readonly release: string;
  readonly arch: string;
  readonly graphics: string;
}

export function buildAboutInfo(facts: RuntimeFacts): AboutInfo {
  return {
    name: PRODUCT_NAME,
    version: facts.version,
    channel: facts.channel,
    electron: facts.versions.electron ?? 'unknown',
    chromium: facts.versions.chrome ?? 'unknown',
    node: facts.versions.node,
    os: `${facts.platform} ${facts.release} (${facts.arch})`,
    license: 'MIT',
    graphics: facts.graphics,
  };
}

/** Plain text for bug reports. It holds no account or personal data. */
export function formatTechnicalDetails(info: AboutInfo): string {
  return [
    `${info.name} ${info.version} (${info.channel})`,
    `Electron ${info.electron}`,
    `Chromium ${info.chromium}`,
    `Node.js ${info.node}`,
    `OS ${info.os}`,
    `Graphics ${info.graphics}`,
  ].join('\n');
}

/**
 * Packaging stamps the install channel into the app's package.json (ADR
 * 0003). Builds run from source have no channel, and may have no
 * package.json next to the app at all.
 */
export function readInstallChannel(readPackageJson: () => string): string {
  let channel: unknown;
  try {
    channel = (Object(JSON.parse(readPackageJson())) as { installChannel?: unknown })
      .installChannel;
  } catch {
    channel = undefined;
  }
  return typeof channel === 'string' && channel !== '' ? channel : 'development';
}

/** The GPU features that explain most rendering problems, in a fixed order. */
const GPU_FEATURES = ['gpu_compositing', 'rasterization', 'video_decode', 'webgl'] as const;

export function summarizeGpu(status: Readonly<Record<string, string>>): string {
  return GPU_FEATURES.map((feature) => `${feature}=${status[feature] ?? 'unknown'}`).join(', ');
}

/**
 * Everything a bug report needs: the technical details, the GPU summary, what
 * the WhatsApp page shows when it can be read, and the recent log lines,
 * which are redacted when they are written.
 */
export function formatDiagnostics(
  info: AboutInfo,
  gpu: string,
  recentLog: readonly string[],
  page?: string,
): string {
  const log = recentLog.length === 0 ? ['(empty)'] : recentLog;
  const details = [formatTechnicalDetails(info), `GPU ${gpu}`];
  if (page !== undefined) {
    details.push(page);
  }
  return [...details, '', 'Recent log:', ...log].join('\n');
}
