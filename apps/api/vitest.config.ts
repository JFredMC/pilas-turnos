import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC conserva los metadatos de decoradores que necesita la inyección de dependencias de Nest.
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    globalSetup: ['test/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 20000,
  },
});
