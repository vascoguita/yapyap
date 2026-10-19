import { execFileSync } from 'node:child_process';
import { mutationTargets } from '../mutation/scope.ts';

const base = process.env['BASE_SHA'] ?? 'origin/master';
const changed = execFileSync(
  'git',
  ['diff', '--name-only', '--diff-filter=AMR', `${base}...HEAD`],
  { encoding: 'utf8' },
);
console.log(mutationTargets(changed.split('\n')).join(','));
