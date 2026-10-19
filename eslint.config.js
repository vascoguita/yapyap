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
    files: ['**/*.test.ts', '**/*.spec.ts', '**/test/**/*.ts', '**/e2e/**/*.ts'],
    rules: { 'max-lines-per-function': 'off' },
  },
);
