const { test, expect } = require('@playwright/test');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const SW_CACHE_NAME = readFileSync(join(__dirname, '..', 'static', 'sw.js'), 'utf8').match(/CACHE='([^']+)'/)[1];

const RAW_KEY = /\b(app|people|options|results|map|route|legal|vector|status|error|unit|tag|cat|mode|share|beta|search|place|district|note|locale)\.[A-Za-z][A-Za-z0-9]*/;

function isLocal(url) {
  if (process.env.TEST_BASE_URL) return url.startsWith(process.env.TEST_BASE_URL);
  return url.includes('127.0.0.1:8765');
}

async function setup(page, { serviceWorker = false } = {}) {
  await page.route('**/tiles.openfreemap.org/**', route => route.abort());
  await page.route('**/photon.komoot.io/api/**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ features: [] }),
  }));
  if (!serviceWorker) await page.route('**/sw.js', route => route.abort());
  await page.goto('/');
  await expect(page.locator('#netstatus')).toHaveText('network ready');
}

test('production stylesheet inlines icons and loads with no missing assets', async ({ page }) => {
  const failures = [];
  page.on('response', response => {
    if (isLocal(response.url()) && response.status() >= 400) failures.push(`${response.status()} ${response.url()}`);
  });
  page.on('requestfailed', request => {
    if (isLocal(request.url())) failures.push(`failed ${request.url()}`);
  });

  await setup(page);

  const css = await (await page.request.get('app.css')).text();
  expect(css).toContain('mask-image:url("data:image/svg+xml');
  const assets = [...css.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)].map(match => match[1])
    .filter(asset => !/^(data:|https?:|blob:)/.test(asset));
  for (const asset of assets) {
    const response = await page.request.get(asset);
    expect(response.ok(), `${asset} should load`).toBeTruthy();
  }

  const visibleIcons = await page.locator('.icon').evaluateAll(elements => elements
    .filter(element => element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }))
    .map(element => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return { mask: style.maskImage, color: style.color, width: rect.width, height: rect.height };
    }));
  expect(visibleIcons.length).toBeGreaterThan(0);
  expect(visibleIcons.every(icon => icon.mask && icon.mask !== 'none')).toBeTruthy();
  expect(visibleIcons.every(icon => icon.color !== 'rgba(0, 0, 0, 0)' && icon.width > 0 && icon.height > 0)).toBeTruthy();
  expect(failures).toEqual([]);
});

test('production header copy is exact and no raw i18n keys leak into the UI', async ({ page }) => {
  await setup(page);
  await expect(page.locator('.brand .logo')).toHaveText('ZG');
  await expect(page.locator('.brand .logo')).toBeVisible();
  await expect(page.locator('h1')).toHaveText('就腳 Zak Geok [zau6 goek3]');
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.locator('.brand .sub')).toHaveText('Find the most convenient meeting point for everyone');
  await expect(page.locator('.brand .sub')).toBeVisible();
  await expect(page.locator('.brand .meaning')).toHaveCount(0);
  const logoStyle = await page.locator('.brand .logo').evaluate(element => {
    const style = getComputedStyle(element);
    return { color: style.color, opacity: style.opacity, visibility: style.visibility };
  });
  expect(logoStyle.color).not.toBe('rgba(0, 0, 0, 0)');
  expect(Number(logoStyle.opacity)).toBeGreaterThan(0);
  expect(logoStyle.visibility).toBe('visible');
  await expect(page.locator('[data-legal="privacy"]')).toHaveText('Privacy');
  await expect(page.locator('[data-legal="terms"]')).toHaveText('Terms');
  await expect(page.locator('[data-legal="credits"]')).toHaveText('Credits');
  await expect(page.locator('.focus-option[data-focus="time"]').first()).toHaveText('Time');
  await expect(page.locator('.focus-option[data-focus="cost"]').first()).toHaveText('Cost');
  expect(await page.locator('body').innerText()).not.toMatch(RAW_KEY);
});

test('production focus controls and fare output are visible', async ({ page }) => {
  await setup(page);
  await expect(page.locator('.card')).toHaveCount(2);
  await expect(page.locator('.focus-label').first()).toBeVisible();
  await expect(page.locator('.focus-option[data-focus="time"]').first()).toBeVisible();
  await expect(page.locator('.focus-option[data-focus="cost"]').first()).toBeVisible();

  await page.locator('#go').click();
  await expect.poll(() => page.locator('path.heat-cell').count()).toBeGreaterThan(0);
  await expect(page.locator('.result-row').first().locator('.fare.total').first()).toBeVisible();
  await expect(page.locator('.result-row').first().locator('.fare.total').first()).toContainText('Fare HK$');
  await expect(page.locator('.fare-note')).toBeVisible();
  await expect(page.locator('.fare-note')).toContainText('Total adult Octopus fare estimate');
});

test('stale cached catalogs cannot resurrect raw i18n keys', async ({ page }) => {
  await setup(page, { serviceWorker: true });
  await page.evaluate(async name => {
    await navigator.serviceWorker.ready;
    const cache = await caches.open(name);
    await cache.put('/i18n/en.json', new Response(JSON.stringify({ 'app.title': 'Stale title' }), {
      headers: { 'content-type': 'application/json' },
    }));
  }, SW_CACHE_NAME);
  await page.reload();
  await expect(page.locator('#netstatus')).toHaveText('network ready');
  await expect(page.locator('h1')).toHaveText('就腳 Zak Geok [zau6 goek3]');
  await expect(page.locator('.focus-option[data-focus="time"]').first()).toHaveText('Time');
  await expect(page.locator('[data-legal="privacy"]')).toHaveText('Privacy');
  expect(await page.locator('body').innerText()).not.toMatch(RAW_KEY);
});

test('recenter control sits on the map beside the zoom control', async ({ page }) => {
  await setup(page);
  const zoom = await page.locator('.leaflet-control-zoom').boundingBox();
  const recenter = await page.locator('.map-recenter-control').boundingBox();
  expect(zoom).not.toBeNull();
  expect(recenter).not.toBeNull();
  expect(Math.abs(recenter.x - zoom.x)).toBeLessThan(2);
  expect(recenter.y - (zoom.y + zoom.height)).toBeGreaterThanOrEqual(0);
  expect(recenter.y - (zoom.y + zoom.height)).toBeLessThan(12);
  await expect(page.locator('#recenter')).toHaveCount(0);
  await expect(page.locator('.map-recenter-control .map-recenter')).toHaveAttribute('aria-label', 'Recenter map');
});

test('service worker precaches the bundle, data, and catalogs for offline use', async ({ page }) => {
  await setup(page, { serviceWorker: true });
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  const cached = await page.evaluate(async name => {
    const cache = await caches.open(name);
    const entries = ['/app.js', '/app.css', '/index.html', '/data/nodes.json', '/i18n/en.json'];
    return Object.fromEntries(await Promise.all(entries.map(async entry => [entry, !!(await cache.match(entry))])));
  }, SW_CACHE_NAME);
  expect(cached).toEqual({
    '/app.js': true,
    '/app.css': true,
    '/index.html': false,
    '/data/nodes.json': true,
    '/i18n/en.json': true,
  });
});
