import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'plugin-example',
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
