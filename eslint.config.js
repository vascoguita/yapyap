import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

const COVERAGE_IGNORE = /\b(?:istanbul|c8|v8)\s+ignore\b/;

// Coverage must be earned by tests; the test-strategy ADR forbids ignore directives.
/** @type {import('eslint').Rule.RuleModule} */
const noCoverageIgnore = {
  meta: { type: 'problem', messages: { forbidden: 'Coverage-ignore directives are forbidden.' } },
  create(context) {
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          if (comment.loc && COVERAGE_IGNORE.test(comment.value)) {
            context.report({ loc: comment.loc, messageId: 'forbidden' });
          }
        }
      },
    };
  },
};

export default defineConfig(
  {
    ignores: [
      '**/node_modules/',
      '**/out/',
      '**/dist/',
      '**/release/',
      'coverage/',
      'reports/',
      '.stryker-tmp/',
      'docs/.vitepress/cache/',
      'docs/.vitepress/dist/',
      'docs/api/',
    ],
  },
  eslint.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { yapyap: { rules: { 'no-coverage-ignore': noCoverageIgnore } } },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      'yapyap/no-coverage-ignore': 'error',
      complexity: ['error', 8],
      'max-lines-per-function': ['error', { max: 40, skipBlankLines: true, skipComments: true }],
      'no-warning-comments': [
        'error',
        { terms: ['todo', 'fixme', 'xxx', 'hack'], location: 'start' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'error',
    },
  },
  {
    // Entry files only wire real Electron objects into tested factories; they
    // are excluded from coverage, so they must stay branch-free (ADR 0005).
    files: [
      'apps/desktop/src/main/index.ts',
      'apps/desktop/src/preload/*/index.ts',
      'apps/desktop/src/renderer/*/main.tsx',
      'scripts/src/bin/*.ts',
    ],
    rules: { complexity: ['error', 1] },
  },
  {
    // Every renderer must start from the hardened factory (ADR 0001).
    files: ['apps/**/*.ts', 'packages/**/*.ts', 'plugins/**/*.ts'],
    ignores: ['apps/desktop/src/main/windows.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...['callee.name', 'callee.property.name'].map((callee) => ({
          selector: `NewExpression[${callee}=/^(BaseWindow|BrowserView|BrowserWindow|WebContentsView)$/]`,
          message: 'Create windows and views through apps/desktop/src/main/windows.ts (ADR 0001).',
        })),
      ],
    },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/test/**/*.ts', '**/e2e/**/*.ts'],
    rules: { 'max-lines-per-function': 'off' },
  },
  {
    // The fake WhatsApp page's scripts run in a browser and are outside every tsconfig.
    files: ['apps/desktop/test/fake-whatsapp/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: { document: 'readonly', window: 'readonly' } },
  },
  {
    // Playwright fixtures without dependencies must destructure an empty object.
    files: ['**/e2e/**/*.ts'],
    rules: { 'no-empty-pattern': 'off' },
  },
);
