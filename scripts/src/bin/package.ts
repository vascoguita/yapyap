import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { buildJobs, needsShell } from '../packaging/targets.ts';

const desktop = join(import.meta.dirname, '..', '..', '..', 'apps', 'desktop');

for (const { args, env } of buildJobs(process.platform, process.arch)) {
  execFileSync('pnpm', ['run', 'builder', ...args], {
    cwd: desktop,
    env: { ...process.env, ...env },
    stdio: 'inherit',
    shell: needsShell(process.platform),
  });
}
