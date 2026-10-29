import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'extension-call-recorder',
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
