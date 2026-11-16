import { describe, expect, it } from 'vitest';
import { changeScope } from './changes.ts';

const CODE = 'apps/desktop/src/main/app/menu.ts';

describe('changeScope', () => {
  it('skips tests and packaging when only documentation changed', () => {
    expect(
      changeScope(['README.md', 'docs/guide/index.md', 'docs/.vitepress/config.ts', 'LICENSE']),
    ).toEqual({ code: false, packaging: 'none', macos: false, renovate: false });
    expect(changeScope(['.github/ISSUE_TEMPLATE/bug_report.yml', 'CLAUDE.md'])).toEqual({
      code: false,
      packaging: 'none',
      macos: false,
      renovate: false,
    });
  });

  it('runs tests and one package per system, macOS aside, when code changed', () => {
    expect(changeScope(['docs/progress.md', CODE])).toEqual({
      code: true,
      packaging: 'representative',
      macos: false,
      renovate: false,
    });
    expect(changeScope(['apps/desktop/test/fake-whatsapp/index.html']).code).toBe(true);
  });

  it.each([
    'apps/desktop/electron-builder.yml',
    'apps/desktop/build/icon.svg',
    'packaging/flatpak/org.guita.YapYap.yml',
    'scripts/src/packaging/targets.ts',
    'scripts/src/release/aur.ts',
    'scripts/src/bin/verify-fuses.ts',
    'scripts/src/bin/package.ts',
    'scripts/src/bin/distribution.ts',
    '.github/workflows/distribute.yml',
    '.github/workflows/smoke.yml',
    '.github/actions/setup/action.yml',
  ])('runs the full packaging matrix, macOS included, when %s changed', (file) => {
    expect(changeScope([CODE, file])).toEqual({
      code: true,
      packaging: 'full',
      macos: true,
      renovate: false,
    });
  });

  it.each([
    'package.json',
    'apps/desktop/package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    '.nvmrc',
  ])('runs one package per system, macOS included, when the dependency file %s changed', (file) => {
    expect(changeScope([file])).toEqual({
      code: true,
      packaging: 'representative',
      macos: true,
      renovate: false,
    });
  });

  it('runs macOS for code that holds macOS-specific branches', () => {
    const scope = changeScope(['docs/index.md', CODE], { macOSFiles: new Set([CODE]) });
    expect(scope).toEqual({
      code: true,
      packaging: 'representative',
      macos: true,
      renovate: false,
    });
    expect(changeScope(['apps/desktop/resources/Info.plist']).macos).toBe(true);
  });

  it('does not run macOS for documentation that mentions it', () => {
    expect(
      changeScope(['docs/guide/macos.md'], { macOSFiles: new Set(['docs/guide/macos.md']) }).macos,
    ).toBe(false);
  });

  it('checks the CI workflow on every system, and the Renovate config it pins', () => {
    expect(changeScope(['.github/workflows/ci.yml'])).toEqual({
      code: true,
      packaging: 'representative',
      macos: true,
      renovate: true,
    });
    expect(changeScope(['.github/renovate.json'])).toEqual({
      code: true,
      packaging: 'representative',
      macos: false,
      renovate: true,
    });
  });

  it('counts a documentation-only packaging file as no code, yet packages fully', () => {
    expect(changeScope(['packaging/README.md'])).toEqual({
      code: false,
      packaging: 'full',
      macos: true,
      renovate: false,
    });
  });

  it('normalizes Windows separators and ignores blank lines', () => {
    expect(changeScope(['', ' docs\\guide\\index.md ', '\n'])).toEqual({
      code: false,
      packaging: 'none',
      macos: false,
      renovate: false,
    });
  });

  it('checks everything when there is nothing to compare, or for a release', () => {
    const everything = { code: true, packaging: 'full', macos: true, renovate: true };
    expect(changeScope([])).toEqual(everything);
    expect(changeScope(['', '  '])).toEqual(everything);
    expect(changeScope(['CHANGELOG.md'], { release: true })).toEqual(everything);
  });
});
