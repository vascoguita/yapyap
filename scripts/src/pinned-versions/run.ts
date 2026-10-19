import type { GitHubPort } from './github.ts';
import {
  FLATPAK_MANIFEST,
  mergePlans,
  NVMRC,
  planFlatpak,
  planNode,
  ROOT_PACKAGE,
  type Plan,
} from './plan.ts';
import { latestBaseAppBranch, latestNodeLts, type NodeRelease } from './versions.ts';

export const BRANCH = 'chore/pinned-versions';
export const NODE_INDEX = 'https://nodejs.org/dist/index.json';
export const BASEAPP_REPOSITORY = 'flathub/org.electronjs.Electron2.BaseApp';
const TITLE = 'build: update pinned versions';

export type Outcome = 'up-to-date' | 'pending' | 'opened';

export interface Dependencies {
  readonly github: GitHubPort;
  readonly base: string;
  readonly readFile: (path: string) => Promise<string | undefined>;
  readonly fetchJson: (url: string) => Promise<unknown>;
  readonly log: (message: string) => void;
}

function parseNodeIndex(index: unknown): NodeRelease[] {
  if (!Array.isArray(index)) return [];
  return index.flatMap((entry: unknown) => {
    const { version, lts } = (typeof entry === 'object' && entry !== null ? entry : {}) as Record<
      string,
      unknown
    >;
    return typeof version === 'string' && (typeof lts === 'string' || lts === false)
      ? [{ version, lts }]
      : [];
  });
}

async function computePlan(deps: Dependencies): Promise<Plan> {
  const [nvmrc, rootPackage, manifest, index, branches] = await Promise.all([
    deps.readFile(NVMRC),
    deps.readFile(ROOT_PACKAGE),
    deps.readFile(FLATPAK_MANIFEST),
    deps.fetchJson(NODE_INDEX),
    deps.github.listBranchNames(BASEAPP_REPOSITORY),
  ]);
  return mergePlans(
    planNode(nvmrc, rootPackage ?? '', latestNodeLts(parseNodeIndex(index))),
    planFlatpak(manifest, latestBaseAppBranch(branches)),
  );
}

async function openUpdate({ github, base, log }: Dependencies, plan: Plan): Promise<Outcome> {
  const baseOid = await github.headOid(base);
  if (baseOid === undefined) throw new Error(`Base branch ${base} not found`);
  if ((await github.headOid(BRANCH)) !== undefined) await github.deleteBranch(BRANCH);
  await github.createBranch(BRANCH, baseOid);
  const body = plan.summaries.map((line) => `- ${line}`).join('\n');
  await github.commit({
    branch: BRANCH,
    expectedHeadOid: baseOid,
    headline: TITLE,
    body,
    files: plan.files,
  });
  const url = await github.openPullRequest({
    head: BRANCH,
    base,
    title: TITLE,
    body: `Automated weekly check of versions Dependabot cannot track.\n\n${body}`,
  });
  log(`Opened ${url}`);
  return 'opened';
}

export async function checkPinnedVersions(deps: Dependencies): Promise<Outcome> {
  const plan = await computePlan(deps);
  if (plan.files.length === 0) {
    deps.log('All pinned versions are current.');
    return 'up-to-date';
  }
  const open = await deps.github.findOpenPullRequest(BRANCH);
  if (open !== undefined) {
    deps.log(`Update already proposed in pull request ${String(open)}.`);
    return 'pending';
  }
  return openUpdate(deps, plan);
}
