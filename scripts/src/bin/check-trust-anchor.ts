import { TRUST_ANCHORS } from '../../../packages/plugin-sign/src/anchors.ts';
import { checkTrustAnchor } from '../trust-anchor/check.ts';

const MESSAGES = {
  match: 'The embedded trust anchor matches PLUGIN_SIGNING_PUBLIC_KEY.',
  mismatch:
    '::error::PLUGIN_SIGNING_PUBLIC_KEY is not the first trust anchor in packages/plugin-sign/src/anchors.ts (see CONTRIBUTING, Plugin signing key rotation).',
  'no-variable': '::notice::PLUGIN_SIGNING_PUBLIC_KEY is not available here; nothing to check.',
};

const result = checkTrustAnchor(process.env['PLUGIN_SIGNING_PUBLIC_KEY'] ?? '', TRUST_ANCHORS);
console.log(MESSAGES[result]);
process.exitCode = Number(result === 'mismatch');
