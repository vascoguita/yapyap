import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'extension-ai-assistant',
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
