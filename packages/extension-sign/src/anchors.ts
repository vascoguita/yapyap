/**
 * Public keys that may sign first-party extensions, embedded in YapYap (ADR 0004).
 * The first is the repository variable EXTENSION_SIGNING_PUBLIC_KEY, which CI
 * checks. Rotating the key adds the new one here before it signs anything
 * (CONTRIBUTING, "Extension signing key rotation").
 */
export const TRUST_ANCHORS: readonly string[] = [
  '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAFGvd082zu4/WS1mD1HlaQSi588wA0hVrA8c6m/61U8k=\n-----END PUBLIC KEY-----',
];
