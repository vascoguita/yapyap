# plugin-sign

Ed25519 signing and verification for YapYap plugins (ADR 0004).

```sh
node packages/plugin-sign/src/bin/yapyap-plugin-sign.ts sign --key <private-key.pem> <plugin-folder>
node packages/plugin-sign/src/bin/yapyap-plugin-sign.ts verify <plugin-folder>
```

- `sign` reads a PKCS#8 PEM Ed25519 private key and writes a `signature` into
  the folder's `manifest.json`: the public key (base64 SPKI DER), the
  algorithm and the signature over the canonical JSON of the manifest
  (without its signature) and the SHA-256 of every other file, sorted by
  path. It prints the key's fingerprint, never the key.
- `verify` checks that signature against the folder's current files and
  exits with 0 when it holds, 1 when it does not, and 2 on a usage error.
- Folders with symbolic links are refused.

The modules under `src/` are also what YapYap uses to verify plugins at
install time.
