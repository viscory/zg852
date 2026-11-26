const { test, expect } = require('@playwright/test');
const { existsSync, readFileSync, statSync } = require('node:fs');
const { gunzipSync } = require('node:zlib');
const { join } = require('node:path');

const root = join(__dirname, '..');
const publicDir = join(root, 'public');
const SW_SOURCE = readFileSync(join(root, 'static', 'sw.js'), 'utf8');
const SW_CACHE_NAME = SW_SOURCE.match(/CACHE='([^']+)'/)[1];

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
  }, SW_CACHE_NAME);
  expect(precached, 'bare worker URL should be precached').toBeTruthy();

  await context.setOffline(true);
  const result = await page.evaluate(async () => {
    const response = await fetch('/maplibre-gl-worker.mjs?v=6.19.0');
    return { ok: response.ok, status: response.status, bodyLength: (await response.text()).length };
  });
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
  }, { name: SW_CACHE_NAME, path: missing });
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

test('service worker precache list still covers required offline assets', () => {
  expect(SW_CACHE_NAME).toBe('zg852-v75');
  const sw = readFileSync(join(publicDir, 'sw.js'), 'utf8');
  const list = sw.match(/const ASSETS=\[([^\]]*)\]/);
  expect(list).not.toBeNull();
  const assets = [...list[1].matchAll(/['"](\.\/[^'"]+)['"]/g)].map(match => match[1].replace(/^\.\//, '/'));
  for (const required of ['/index.html', '/app.js', '/app.css', '/data/network.json', '/data/nodes.json', '/data/mtr-fares.json', '/data/route-fares.json', '/i18n/en.json', '/maplibre-gl-worker.mjs']) {
    expect(assets, `${required} should be precached`).toContain(required);
  }
  expect(assets).not.toContain('/sw.js');
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
    expect(block).toMatch(/Content-Type: /);
    expect(block).toMatch(/Cache-Control: /);
  }

  const app = readFileSync(join(publicDir, 'app.js'));
  const appGz = readFileSync(join(publicDir, 'app.js.gz'));
  // Compare decompressed bytes, not the compressed stream: gzip headers and
  // deflate output vary across zlib versions even for identical input.
  expect(gunzipSync(appGz).equals(app), 'precompressed asset must decompress to the original bytes').toBeTruthy();
});
