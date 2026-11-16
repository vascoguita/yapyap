import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { onTestFinished } from 'vitest';

/**
 * A new folder in the system's temp folder, removed once the current test
 * ends, pass or fail, so test runs do not fill the temp folder.
 */
export function tempDir(prefix = 'yapyap-test-'): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  onTestFinished(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}
