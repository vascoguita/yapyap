import { describePageState } from '../../adapter/page-state.ts';
import type { AdapterPage } from '../../adapter/world.ts';
import {
  buildAboutInfo,
  formatDiagnostics,
  summarizeGpu,
  type RuntimeFacts,
} from '../about/about-info.ts';
import {
  decideUpdatePolicy,
  describeUpdatePolicy,
  type InstallEvidence,
} from '../updates/update-policy.ts';
import { readPageState } from './page-state.ts';

export interface DiagnosticSources {
  readonly facts: () => RuntimeFacts;
  /** `app.getGPUFeatureStatus()`, summarized for diagnostics. */
  readonly gpuStatus: () => Readonly<Record<string, string>>;
  /** What YapYap observes about how it was installed, for the update policy. */
  readonly installEvidence: () => InstallEvidence;
  /** The recent, already redacted log lines. */
  readonly recentLog: () => readonly string[];
}

/** What a problem report or the recovery screen copies: versions, GPU, updates, the log. */
export function diagnostics(sources: DiagnosticSources, page?: string): string {
  const info = buildAboutInfo(sources.facts());
  const updates = decideUpdatePolicy(info.channel, sources.installEvidence());
  const runtime = [`GPU ${summarizeGpu(sources.gpuStatus())}`, describeUpdatePolicy(updates)];
  return formatDiagnostics(
    info,
    page === undefined ? runtime : [...runtime, page],
    sources.recentLog(),
  );
}

/** The first WhatsApp view is the one diagnostics describe until accounts arrive. */
export async function currentDiagnostics(
  sources: DiagnosticSources,
  pages: readonly AdapterPage[],
): Promise<string> {
  const page = pages[0];
  const state = page === undefined ? undefined : await readPageState(page);
  return diagnostics(sources, describePageState(state));
}
