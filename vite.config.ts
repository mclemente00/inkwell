import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// Relative base so the build works at a domain root or under /inkwell/ (GitHub Pages).
export default defineConfig({
  base: './',
  plugins: [preact()],
  build: { target: 'es2022', assetsInlineLimit: 0 },
});
