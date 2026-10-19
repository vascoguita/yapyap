import { FuseV1Options, getCurrentFuseWire } from '@electron/fuses';
import { fuseMismatches } from '../packaging/fuses.ts';

const executables = process.argv.slice(2);
const failures: string[] = [];
for (const executable of executables) {
  const mismatches = fuseMismatches(await getCurrentFuseWire(executable), FuseV1Options);
  failures.push(...mismatches.map((mismatch) => `${executable}: ${mismatch}`));
}
console.log(
  failures.join('\n') || `Fuses hardened in ${String(executables.length)} executable(s).`,
);
process.exitCode = Number(failures.length > 0 || executables.length === 0);
