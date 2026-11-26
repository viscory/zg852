import { cp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public');

const COMPRESSIBLE_EXTENSIONS = new Set(['.css', '.html', '.js', '.json', '.mjs', '.svg', '.txt', '.webmanifest', '.xml']);
const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

async function findCompressibleAssets(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const found = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const absolute = join(directory, entry.name);
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      found.push(...await findCompressibleAssets(absolute, relative));
      continue;
    }
    if (!entry.isFile() || relative.endsWith('.gz') || relative === '_headers' || relative === 'sw.js') continue;
    const extension = extname(entry.name).toLowerCase();
    if (COMPRESSIBLE_EXTENSIONS.has(extension) && (await stat(absolute)).size >= 1024) {
      found.push({ absolute, relative, extension });
    }
  }
  return found;
}

function cacheControlFor(relative) {
  return /^(data|i18n)\//.test(relative) || ['llms.txt', 'robots.txt', 'sitemap.xml'].includes(relative)
    ? 'public, max-age=3600'
    : 'no-cache';
}

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

/process.html
  Cache-Control: no-cache

/sitemap.xml
  Cache-Control: public, max-age=3600

/og-image.png
  Cache-Control: public, max-age=86400

/favicon.svg
  Cache-Control: public, max-age=86400

/manifest.webmanifest
  Content-Type: application/manifest+json; charset=utf-8
  Cache-Control: public, max-age=3600

/icon-180.png
  Cache-Control: public, max-age=86400

/icon-512.png
  Cache-Control: public, max-age=86400

/llms.txt
  Cache-Control: public, max-age=3600

/data/*
  Cache-Control: public, max-age=3600

/i18n/*
  Cache-Control: public, max-age=3600
`;

// Human-readable legal/attribution docs are linked from the app, so the same
// set must be copied verbatim next to the built shell. Keep this list in sync
// with the footer links rather than copying the whole repo root.
const COPIED_DOCS = ['README.md', 'LICENSE', 'PRIVACY.md', 'TERMS.md', 'CREDITS.md', 'THIRD_PARTY_NOTICES.md'];
for (const name of COPIED_DOCS) {
  const source = join(root, name);
  if (existsSync(source)) await cp(source, join(out, name));
}

// Only generated datasets the app fetches at runtime may ship. Everything
// else in static/data (raw feeds, pipeline intermediates) stays out of the
// deployment. In particular graph.json (~7.4MB) is tracked in git solely as a
// build input for downstream generators: it is deliberately excluded here but
// is not deleted or untracked.
const deployedDataFiles = new Set(['nodes.json', 'network.json', 'districts.json', 'poi-index.json', 'hkbus.json', 'mtr-fares.json', 'route-fares.json']);
const dataDir = join(out, 'data');
for (const entry of await readdir(dataDir)) {
  if (!deployedDataFiles.has(entry)) await rm(join(dataDir, entry), { recursive: true, force: true });
}

// maplibre-gl resolves its worker relative to the bundle URL, so the worker
// file must sit next to app.js at the site root.
const workerSource = join(root, 'node_modules', 'maplibre-gl', 'dist', 'maplibre-gl-worker.mjs');
if (!existsSync(workerSource)) throw new Error('maplibre-gl worker not found in node_modules');
await cp(workerSource, join(out, 'maplibre-gl-worker.mjs'));

// static/sw.js is already in its deployable form: Vite copies it verbatim from
// static/, and its asset list no longer contains a self-reference. There is no
// post-build patch step, so source and deployed service worker are identical.
const strayStyles = join(out, 'styles.css');
if (existsSync(strayStyles)) await rm(strayStyles);

// Ship deterministic precompressed copies alongside the originals. Hosts that
// can map an asset request to its .gz sibling get a real compressed response;
// plain static servers keep serving the uncompressed files as before.
const compressedAssets = await findCompressibleAssets(out);
for (const { absolute } of compressedAssets) {
  await writeFile(`${absolute}.gz`, gzipSync(await readFile(absolute), { level: 9, mtime: 0 }));
}
const compressionHeaders = compressedAssets.map(({ relative, extension }) =>
  `/${relative}.gz\n  Content-Type: ${CONTENT_TYPES[extension]}\n  Content-Encoding: gzip\n  Cache-Control: ${cacheControlFor(relative)}\n`
).join('\n');
await writeFile(join(out, '_headers'), `${headers}\n${compressionHeaders}`);

console.log(`Finalized ${out} (${compressedAssets.length} precompressed assets)`);
