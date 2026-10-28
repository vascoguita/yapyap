import { execFileSync } from 'node:child_process';
import { mutationShard, mutationTargets } from '../mutation/scope.ts';

const base = process.env['BASE_SHA'] ?? 'origin/master';
// `--all` takes every in-scope module, as the nightly run does; otherwise the
// modules a pull request changed. `--shard 3/16` keeps their third sixteenth.
const args = process.argv.slice(2);
const all = args.includes('--all');
const which = args[args.indexOf('--shard') + 1] ?? '';
const sharded = args.includes('--shard');
const changed = execFileSync(
  'git',
  all ? ['ls-files'] : ['diff', '--name-only', '--diff-filter=AMR', `${base}...HEAD`],
  { encoding: 'utf8' },
);
const [shard = 0, shards = 0] = which.split('/').map(Number);
const files = changed.split('\n');
process.stdout.write(
  `${(sharded ? mutationShard(files, shard, shards) : mutationTargets(files)).join(',')}\n`,
);
