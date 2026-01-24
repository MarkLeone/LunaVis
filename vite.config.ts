import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  // Enable raw imports for .wgsl shader files
  assetsInclude: ['**/*.wgsl'],
  server: {
    port: 3000,
  },
  build: {
    target: 'esnext',
  },
});
