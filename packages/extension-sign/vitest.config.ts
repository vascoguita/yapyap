import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'extension-sign',
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
