import { cp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public');

const headers = `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: DENY
  Permissions-Policy: geolocation=(), camera=(), microphone=()
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self' https://tiles.openfreemap.org https://photon.komoot.io; worker-src blob: 'self'; font-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'

/
  Cache-Control: no-cache

/index.html
  Cache-Control: no-cache

/sw.js
  Cache-Control: no-cache
  Service-Worker-Allowed: /

/preview-noindex.js
  Cache-Control: no-cache

/app.js
  Cache-Control: no-cache

/app.css
  Cache-Control: no-cache

/legal.css
  Cache-Control: no-cache

/privacy.html
  Cache-Control: no-cache

/terms.html
  Cache-Control: no-cache

/credits.html
  Cache-Control: no-cache

/sitemap.xml
  Cache-Control: public, max-age=3600

/og-image.png
  Cache-Control: public, max-age=86400

/favicon.svg
  Cache-Control: public, max-age=86400

/llms.txt
  Cache-Control: public, max-age=3600

/data/*
  Cache-Control: public, max-age=3600

/i18n/*
  Cache-Control: public, max-age=3600
`;

function patchServiceWorker(source) {
  const token = "'./sw.js',";
  if (!source.includes(token)) throw new Error(`Expected service worker asset entry not found: ${token}`);
  return source.replace(token, '');
}

for (const name of ['README.md', 'LICENSE', 'PRIVACY.md', 'TERMS.md', 'CREDITS.md', 'THIRD_PARTY_NOTICES.md']) {
  const source = join(root, name);
  if (existsSync(source)) await cp(source, join(out, name));
}

// Only generated datasets the app fetches at runtime may ship. Everything
// else in static/data (raw feeds, pipeline intermediates) stays out of the
// deployment.
const deployedDataFiles = new Set(['nodes.json', 'network.json', 'districts.json', 'poi-index.json']);
const dataDir = join(out, 'data');
for (const entry of await readdir(dataDir)) {
  if (!deployedDataFiles.has(entry)) await rm(join(dataDir, entry), { recursive: true, force: true });
}

// maplibre-gl resolves its worker relative to the bundle URL, so the worker
// file must sit next to app.js at the site root.
const workerSource = join(root, 'node_modules', 'maplibre-gl', 'dist', 'maplibre-gl-worker.mjs');
if (!existsSync(workerSource)) throw new Error('maplibre-gl worker not found in node_modules');
await cp(workerSource, join(out, 'maplibre-gl-worker.mjs'));

const swPath = join(out, 'sw.js');
await writeFile(swPath, patchServiceWorker(await readFile(swPath, 'utf8')));
const strayStyles = join(out, 'styles.css');
if (existsSync(strayStyles)) await rm(strayStyles);
await writeFile(join(out, '_headers'), headers);

console.log(`Finalized ${out}`);
