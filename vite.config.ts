import { defineConfig } from 'vite';

// assets/ is served as the site root: fonts/, data/, emblems/ (the emblem files come from
// `python tools/data/fetch_emblems.py --sync`; only the manifest is in git)
export default defineConfig({
  publicDir: 'assets',
  base: './',
  // v2.html: the Three.js engine (src/v2), rendered with export/render.mjs --page v2.html
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022', rollupOptions: { input: { index: 'index.html', v2: 'v2.html' } } },
  server: { port: 5178 },
});
