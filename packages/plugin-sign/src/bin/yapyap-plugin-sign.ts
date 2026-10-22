import { readFileSync } from 'node:fs';
import { runCli } from '../cli.ts';

process.exitCode = runCli(process.argv.slice(2), {
  readFile: (path) => readFileSync(path, 'utf8'),
  out: (line) => {
    process.stdout.write(`${line}\n`);
  },
  err: (line) => {
    process.stderr.write(`${line}\n`);
  },
});
