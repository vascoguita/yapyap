import { mkdirSync, readdirSync } from 'node:fs';
import { TRUST_ANCHORS } from '../../../packages/plugin-sign/src/anchors.ts';
import { anchorFingerprints } from '../../../packages/plugin-sign/src/trust.ts';
import { builtFirstParty, signFirstParty } from '../plugins/first-party.ts';

// Run from the repository root after `pnpm --filter "./plugins/**" build`.
const key = process.env['PLUGIN_SIGNING_KEY'] ?? '';
const plugins = builtFirstParty('plugins', readdirSync('plugins'));
if (key === '') {
  process.stderr.write(
    '::error::PLUGIN_SIGNING_KEY is not set, so the first-party plugins cannot be signed.\n',
  );
  process.exitCode = 1;
} else {
  mkdirSync('plugins-out', { recursive: true });
  signFirstParty(plugins, key, anchorFingerprints(TRUST_ANCHORS), 'plugins-out', (line) => {
    process.stdout.write(`${line}\n`);
  });
}
