import { mkdirSync, readdirSync } from 'node:fs';
import { TRUST_ANCHORS } from '../../../packages/extension-sign/src/anchors.ts';
import { anchorFingerprints } from '../../../packages/extension-sign/src/trust.ts';
import { builtFirstParty, signFirstParty } from '../extensions/first-party.ts';

// Run from the repository root after `pnpm --filter "./extensions/**" build`.
const key = process.env['EXTENSION_SIGNING_KEY'] ?? '';
const extensions = builtFirstParty('extensions', readdirSync('extensions'));
if (key === '') {
  process.stderr.write(
    '::error::EXTENSION_SIGNING_KEY is not set, so the first-party extensions cannot be signed.\n',
  );
  process.exitCode = 1;
} else {
  mkdirSync('extensions-out', { recursive: true });
  signFirstParty(extensions, key, anchorFingerprints(TRUST_ANCHORS), 'extensions-out', (line) => {
    process.stdout.write(`${line}\n`);
  });
}
