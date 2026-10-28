import { TRUST_ANCHORS } from '../../../packages/extension-sign/src/anchors.ts';
import { checkTrustAnchor } from '../trust-anchor/check.ts';

const MESSAGES = {
  match: 'The embedded trust anchor matches EXTENSION_SIGNING_PUBLIC_KEY.',
  mismatch:
    '::error::EXTENSION_SIGNING_PUBLIC_KEY is not the first trust anchor in packages/extension-sign/src/anchors.ts (see CONTRIBUTING, Extension signing key rotation).',
  'no-variable': '::notice::EXTENSION_SIGNING_PUBLIC_KEY is not available here; nothing to check.',
};

const result = checkTrustAnchor(process.env['EXTENSION_SIGNING_PUBLIC_KEY'] ?? '', TRUST_ANCHORS);
console.log(MESSAGES[result]);
process.exitCode = Number(result === 'mismatch');
