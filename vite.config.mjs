import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src',
  publicDir: resolve('static'),
  build: {
    outDir: resolve('public'),
    emptyOutDir: true,
    assetsDir: '',
    rollupOptions: {
      input: {
        app: resolve('src/index.html'),
        privacy: resolve('src/privacy.html'),
        terms: resolve('src/terms.html'),
        credits: resolve('src/credits.html'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name][extname]',
      },
    },
  },
});
