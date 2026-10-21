import { readFile } from 'node:fs/promises';
import { optionalFileReader, jsonFetcher, resolveConfig } from '../pinned-versions/environment.ts';
import { createGitHub } from '../pinned-versions/github.ts';
import { checkPinnedVersions } from '../pinned-versions/run.ts';

const { token, repository, base } = resolveConfig(process.env);

await checkPinnedVersions({
  base,
  github: createGitHub(token, repository, fetch),
  readFile: optionalFileReader((path) => readFile(path, 'utf8')),
  fetchJson: jsonFetcher(fetch),
  // The report quotes versions read from the network, so it may not add lines of its own.
  log: (message) => {
    console.log(message.replaceAll(/[\r\n]+/g, ' '));
  },
});
