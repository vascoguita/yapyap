import { describe, expect, it } from 'vitest';
import {
  FLATPAK_MANIFEST,
  mergePlans,
  NVMRC,
  planFlatpak,
  planNode,
  ROOT_PACKAGE,
} from './plan.ts';

const pkg = '{\n  "engines": {\n    "node": ">=24.22.0"\n  }\n}\n';
const manifest =
  "app-id: org.guita.yapyap.YapYap\nruntime-version: '25.08'\nbase-version: '25.08'\n";

describe('planNode', () => {
  it('bumps .nvmrc and the engines range when a newer LTS exists', () => {
    expect(planNode('24.22.0\n', pkg, '24.23.0')).toEqual({
      files: [
        { path: NVMRC, contents: '24.23.0\n' },
        { path: ROOT_PACKAGE, contents: pkg.replace('>=24.22.0', '>=24.23.0') },
      ],
      summaries: ['Node.js LTS 24.22.0 → 24.23.0'],
    });
  });

  it.each([
    ['24.22.0', '24.22.0'],
    ['24.22.0', '24.9.0'],
    ['24.22.0', undefined],
  ])('does nothing when current is %s and latest is %s', (current, latest) => {
    expect(planNode(current, pkg, latest)).toEqual({ files: [], summaries: [] });
  });

  it('does nothing without an .nvmrc', () => {
    expect(planNode(undefined, pkg, '30.0.0').files).toEqual([]);
  });
});

describe('planFlatpak', () => {
  it('bumps runtime and BaseApp together', () => {
    expect(planFlatpak(manifest, '26.08')).toEqual({
      files: [{ path: FLATPAK_MANIFEST, contents: manifest.replaceAll('25.08', '26.08') }],
      summaries: ['Flatpak runtime and Electron BaseApp 25.08 → 26.08'],
    });
  });

  it.each([
    ['no manifest', undefined, '26.08'],
    ['no runtime-version line', 'app-id: x\n', '26.08'],
    ['already current', manifest, '25.08'],
    ['unknown latest', manifest, undefined],
  ])('does nothing with %s', (_name, contents, latest) => {
    expect(planFlatpak(contents, latest).files).toEqual([]);
  });
});

describe('mergePlans', () => {
  it('concatenates files and summaries in order', () => {
    const a = { files: [{ path: 'a', contents: '1' }], summaries: ['A'] };
    const b = { files: [{ path: 'b', contents: '2' }], summaries: ['B'] };
    expect(mergePlans(a, b)).toEqual({ files: [...a.files, ...b.files], summaries: ['A', 'B'] });
  });
});
