import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'extension-example',
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
