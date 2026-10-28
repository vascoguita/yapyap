export { TRUST_ANCHORS } from './anchors.ts';
export { compareCodeUnits } from './canonical.ts';
export {
  ARCHIVE_LIMITS,
  readExtensionArchive,
  verifyArchive,
  type ArchiveLimits,
  type ExtensionArchive,
} from './archive.ts';
export { digestFiles, type FileDigest } from './files.ts';
export { signIndex, verifyIndex } from './index-signature.ts';
export { matchesIntegrity } from './integrity.ts';
export { fingerprint, readPublicKey } from './keys.ts';
export { readPins, writePins, type Pins } from './pins.ts';
export { signingPayload, verifyManifest, type Manifest, type Verification } from './signature.ts';
export {
  anchorFingerprints,
  decideTrust,
  FIRST_PARTY_PREFIX,
  type TrustDecision,
  type TrustInput,
} from './trust.ts';
