import { packPluginFolder, signPluginFolder, verifyPluginFolder } from './plugin-folder.ts';

export interface CliIo {
  readonly readFile: (path: string) => string;
  readonly writeFile: (path: string, bytes: Uint8Array) => void;
  readonly out: (line: string) => void;
  readonly err: (line: string) => void;
}

const USAGE = [
  'Usage:',
  '  yapyap-plugin-sign sign --key <private-key.pem> <plugin-folder>',
  '  yapyap-plugin-sign verify <plugin-folder>',
  '  yapyap-plugin-sign pack <plugin-folder> <archive.yapyap-plugin>',
].join('\n');

function sign(args: readonly string[], io: CliIo): number {
  // A folder comes after the key, so a present folder means a present key path.
  const [flag, keyPath = '', folder, ...rest] = args;
  if (flag !== '--key' || folder === undefined || rest.length > 0) {
    io.err(USAGE);
    return 2;
  }
  const keyFingerprint = signPluginFolder(folder, io.readFile(keyPath));
  io.out(`Signed ${folder} with key ${keyFingerprint}`);
  return 0;
}

function verify(args: readonly string[], io: CliIo): number {
  const [folder, ...rest] = args;
  if (folder === undefined || rest.length > 0) {
    io.err(USAGE);
    return 2;
  }
  const result = verifyPluginFolder(folder);
  if (result.valid) {
    io.out(`Valid signature by key ${result.fingerprint}`);
    return 0;
  }
  io.err(`Invalid: ${result.reason}`);
  return 1;
}

function pack(args: readonly string[], io: CliIo): number {
  const [folder, archive, ...rest] = args;
  if (folder === undefined || archive === undefined || rest.length > 0) {
    io.err(USAGE);
    return 2;
  }
  io.writeFile(archive, packPluginFolder(folder));
  io.out(`Packed ${folder} into ${archive}`);
  return 0;
}

/**
 * Runs one command and returns the exit code. Messages name keys only by
 * fingerprint; nothing here ever prints or writes private key material.
 */
export function runCli(args: readonly string[], io: CliIo): number {
  const [command, ...rest] = args;
  try {
    if (command === 'sign') {
      return sign(rest, io);
    }
    if (command === 'verify') {
      return verify(rest, io);
    }
    if (command === 'pack') {
      return pack(rest, io);
    }
  } catch (error) {
    io.err(error instanceof Error ? error.message : 'Unexpected error.');
    return 1;
  }
  io.err(USAGE);
  return 2;
}
