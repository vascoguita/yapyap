import { describe, expect, it } from 'vitest';
import { hasGpu } from './gpu.ts';

describe('hasGpu', () => {
  it('is true only when WebGPU gives the page an adapter', async () => {
    expect(await hasGpu({ gpu: { requestAdapter: () => Promise.resolve({}) } })).toBe(true);
    expect(await hasGpu({ gpu: { requestAdapter: () => Promise.resolve(null) } })).toBe(false);
    expect(await hasGpu({ gpu: { requestAdapter: () => Promise.reject(new Error('no')) } })).toBe(
      false,
    );
    expect(await hasGpu({})).toBe(false);
  });
});
