const { test, expect } = require('@playwright/test');
const { existsSync, readFileSync, statSync } = require('node:fs');
const { gunzipSync } = require('node:zlib');
const { join } = require('node:path');

const root = join(__dirname, '..');
const publicDir = join(root, 'public');
const REQUIRED_OFFLINE_ASSETS = [
  '/index.html', '/app.js', '/app.css', '/data/network.json', '/data/nodes.json',
  '/data/mtr-fares.json', '/data/route-fares.json', '/i18n/en.json', '/maplibre-gl-worker.mjs',
];
// Derive the worker cache-buster from the installed package so a maplibre
// upgrade cannot silently desynchronise this test from the shipped bundle.
const MAPLIBRE_VERSION = require('maplibre-gl/package.json').version;

// The installed worker owns the cache name. Read it from CacheStorage at
// runtime so the test follows the deployed worker instead of source text.
async function installedCacheName(page) {
  const names = await page.evaluate(() => caches.keys());
  const versioned = names.filter(name => name.startsWith('zg852-v'));
  expect(versioned, 'exactly one versioned zg852 cache should be installed').toHaveLength(1);
  return versioned[0];
}

async function setupWithServiceWorker(page) {
  await page.route('**/tiles.openfreemap.org/**', route => route.abort());
  await page.route('**/photon.komoot.io/api/**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ features: [] }),
  }));
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await page.evaluate(() => navigator.serviceWorker.ready);
}

test('service worker serves the versioned maplibre worker from precache offline', async ({ page, context }) => {
  await setupWithServiceWorker(page);

  const precached = await page.evaluate(async name => {
    const cache = await caches.open(name);
    return !!(await cache.match('/maplibre-gl-worker.mjs'));
  }, await installedCacheName(page));
  expect(precached, 'bare worker URL should be precached').toBeTruthy();

  await context.setOffline(true);
  const result = await page.evaluate(async workerVersion => {
    const response = await fetch(`/maplibre-gl-worker.mjs?v=${workerVersion}`);
    return { ok: response.ok, status: response.status, bodyLength: (await response.text()).length };
  }, MAPLIBRE_VERSION);
  expect(result.ok).toBeTruthy();
  expect(result.status).toBe(200);
  expect(result.bodyLength).toBeGreaterThan(0);
});

test('service worker keeps navigation fallback when offline', async ({ page, context }) => {
  await setupWithServiceWorker(page);
  await context.setOffline(true);

  const rootResponse = await page.evaluate(async () => {
    const response = await fetch('/?from=audit');
    return { ok: response.ok, status: response.status, bodyLength: (await response.text()).length };
  });
  expect(rootResponse.ok).toBeTruthy();
  expect(rootResponse.status).toBe(200);
  expect(rootResponse.bodyLength).toBeGreaterThan(0);

  const indexPathResponse = await page.evaluate(async () => {
    const response = await fetch('/index.html?from=audit');
    return { ok: response.ok, status: response.status };
  });
  expect(indexPathResponse.ok).toBeTruthy();
  expect(indexPathResponse.status).toBe(200);
});

test('service worker does not cache non-OK responses', async ({ page, context }) => {
  await setupWithServiceWorker(page);
  const missing = '/audit-missing-response.json';

  const fetched = await page.evaluate(async path => {
    const response = await fetch(path);
    return { ok: response.ok, status: response.status };
  }, missing);
  expect(fetched.ok).toBeFalsy();
  expect(fetched.status).toBeGreaterThanOrEqual(400);

  const cached = await page.evaluate(async ({ name, path }) => {
    const cache = await caches.open(name);
    return !!(await cache.match(path));
  }, { name: await installedCacheName(page), path: missing });
  expect(cached, '404 response must not enter the cache').toBeFalsy();

  await context.setOffline(true);
  // The cache fallback now resolves with a real 404 instead of an undefined
  // response, so the missing asset surfaces as an error status online and off.
  const offline = await page.evaluate(async path => {
    const response = await fetch(path);
    return { ok: response.ok, status: response.status };
  }, missing);
  expect(offline.ok).toBeFalsy();
  expect(offline.status).toBe(404);
});

test('service worker precache still covers required offline assets', async ({ page }) => {
  // Waiting for the controller means install (precache) and activate have
  // settled, so CacheStorage is the source of truth for what is precached.
  await setupWithServiceWorker(page);
  const name = await installedCacheName(page);
  const cached = await page.evaluate(async ({ name, required }) => {
    const cache = await caches.open(name);
    const entries = await Promise.all(required.map(async url => [url, !!(await cache.match(url))]));
    return { entries: Object.fromEntries(entries), sw: !!(await cache.match('/sw.js')) };
  }, { name, required: REQUIRED_OFFLINE_ASSETS });
  for (const required of REQUIRED_OFFLINE_ASSETS) {
    expect(cached.entries[required], `${required} should be precached`).toBe(true);
  }
  expect(cached.sw, 'sw.js should not be precached').toBe(false);
});

test('build emits precompressed assets and gzip headers without dropping originals', () => {
  const required = ['app.js', 'app.css', 'data/network.json'];
  for (const relative of required) {
    const original = join(publicDir, relative);
    const compressed = `${original}.gz`;
    expect(existsSync(original), `${relative} should stay available uncompressed`).toBeTruthy();
    expect(existsSync(compressed), `${relative}.gz should be generated`).toBeTruthy();
    expect(gunzipSync(readFileSync(compressed)).equals(readFileSync(original))).toBeTruthy();
    expect(statSync(compressed).size).toBeLessThan(statSync(original).size);
  }

  const headers = readFileSync(join(publicDir, '_headers'), 'utf8');
  for (const relative of required) expect(headers).toContain(`/${relative}.gz`);

  const gzipBlocks = headers.split(/\n\s*\n/).filter(block => block.includes('Content-Encoding: gzip'));
  expect(gzipBlocks.length).toBeGreaterThanOrEqual(required.length);
  for (const block of gzipBlocks) {
    expect(block.toLowerCase()).toContain('content-type:');
    expect(block.toLowerCase()).toContain('cache-control:');
  }

  const app = readFileSync(join(publicDir, 'app.js'));
  const appGz = readFileSync(join(publicDir, 'app.js.gz'));
  // Compare decompressed bytes, not the compressed stream: gzip headers and
  // deflate output vary across zlib versions even for identical input.
  expect(gunzipSync(appGz).equals(app), 'precompressed asset must decompress to the original bytes').toBeTruthy();
});
