import { readFile } from 'node:fs/promises';
import { optionalFileReader, jsonFetcher, resolveConfig } from '../pinned-versions/environment.ts';
import { createGitHub } from '../pinned-versions/github.ts';
import { checkPinnedVersions } from '../pinned-versions/run.ts';

const { token, repository, base } = resolveConfig(process.env);

await checkPinnedVersions({
  github: createGitHub(token, repository, fetch),
  base,
  readFile: optionalFileReader((path) => readFile(path, 'utf8')),
  fetchJson: jsonFetcher(fetch),
  log: (message) => {
    console.log(message);
  },
});
