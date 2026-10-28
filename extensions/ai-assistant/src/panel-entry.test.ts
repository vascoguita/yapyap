/** @vitest-environment happy-dom */
import { describe, expect, it } from 'vitest';

describe('the panel’s page', () => {
  it('mounts the panel as soon as it loads', async () => {
    await import('./panel-entry.ts');
    expect(document.querySelector('h1')?.textContent).toBe('AI assistant');
  });
});
