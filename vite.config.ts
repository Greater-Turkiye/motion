import { defineConfig } from 'vite';

// assets/ is served as the site root: fonts/, data/, emblems/ (the emblem files come from
// `python tools/data/fetch_emblems.py --sync`; only the manifest is in git)
export default defineConfig({
  publicDir: 'assets',
  base: './',
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022' },
  server: { port: 5178 },
});
