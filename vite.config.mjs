import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// Every path is anchored to this file so the build behaves the same regardless
// of the directory the Vite CLI happens to be invoked from.
// This config lives at the repo root itself (unlike the scripts/ generators).
const root = dirname(fileURLToPath(import.meta.url));
const src = resolve(root, 'src');
const staticDir = resolve(root, 'static');
const outDir = resolve(root, 'public');
const page = name => resolve(src, `${name}.html`);

export default defineConfig({
  root: src,
  publicDir: staticDir,
  build: {
    outDir,
    emptyOutDir: true,
    assetsDir: '',
    rollupOptions: {
      input: {
        app: page('index'),
        privacy: page('privacy'),
        terms: page('terms'),
        credits: page('credits'),
        process: page('process'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name][extname]',
      },
    },
  },
});
