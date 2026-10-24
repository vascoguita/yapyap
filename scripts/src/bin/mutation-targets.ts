import { execFileSync } from 'node:child_process';
import { mutationShard, mutationTargets } from '../mutation/scope.ts';

const base = process.env['BASE_SHA'] ?? 'origin/master';
// `--shard 3/16` picks the nightly run's third sixteenth of every in-scope
// module; otherwise the modules a pull request changed.
const [flag, which = ''] = process.argv.slice(2);
const sharded = flag === '--shard';
const changed = execFileSync(
  'git',
  sharded ? ['ls-files'] : ['diff', '--name-only', '--diff-filter=AMR', `${base}...HEAD`],
  { encoding: 'utf8' },
);
const [shard = 0, shards = 0] = which.split('/').map(Number);
const files = changed.split('\n');
process.stdout.write(
  `${(sharded ? mutationShard(files, shard, shards) : mutationTargets(files)).join(',')}\n`,
);
