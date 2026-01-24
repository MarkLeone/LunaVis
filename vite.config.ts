/// <reference types="vitest" />
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  // Serve assets folder as public directory
  publicDir: 'assets',
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
  // Vitest configuration (merged from vitest.config.ts)
  test: {
    globals: false,
    environment: 'node',
    exclude: ['**/node_modules/**', '**/e2e/**'],
  },
});
