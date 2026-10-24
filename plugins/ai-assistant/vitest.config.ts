import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'plugin-ai-assistant',
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
