import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'plugin-sign',
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
