/**
 * Public keys that may sign first-party extensions, embedded in YapYap (ADR 0004).
 * The first is the repository variable EXTENSION_SIGNING_PUBLIC_KEY, which CI
 * checks. Rotating the key adds the new one here before it signs anything
 * (CONTRIBUTING, "Extension signing key rotation").
 */
export const TRUST_ANCHORS: readonly string[] = [
  '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAOAiiab1Af9fLhDSKpegFUSP0ajZwvaHNPmzmY5XVeLY=\n-----END PUBLIC KEY-----',
];
