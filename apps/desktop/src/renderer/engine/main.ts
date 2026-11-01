import { wllamaEngine } from './engine.ts';
import { hasGpu } from './gpu.ts';
import { serveEngine } from './serve.ts';

serveEngine(globalThis.yapyapEngine, {
  engine: wllamaEngine({
    wasm: new URL('wllama.wasm', location.href).href,
    hasGpu: () => hasGpu(navigator),
  }),
  model: async () => {
    const response = await fetch('model.gguf');
    return response.blob();
  },
});
