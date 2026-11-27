const { test, expect } = require('@playwright/test');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');
// Inspect package.json only: this proves the named scripts are declared with
// the expected commands, not that any CI workflow actually invokes them.
const SCRIPTS = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts;

test('package.json declares lint, build, test and deploy scripts', () => {
  for (const name of ['lint', 'build', 'test', 'pages:deploy']) {
    expect(Object.prototype.hasOwnProperty.call(SCRIPTS, name), `${name} script should exist`).toBe(true);
  }
  expect(SCRIPTS.lint).toContain('eslint');
  expect(SCRIPTS.build).toContain('vite build');
  expect(SCRIPTS.test).toContain('playwright test');
  expect(SCRIPTS['pages:deploy']).toContain('wrangler pages deploy public');
});

const SHELL_ASSETS = [
  'index.html',
  'app.js',
  'app.css',
  'maplibre-gl-worker.mjs',
  'sw.js',
  'data/nodes.json',
  'i18n/en.json',
];

test('built shell assets exist and result rows keep native buttons inside listitems', async ({ page }) => {
  for (const asset of SHELL_ASSETS) {
    const response = await page.request.get(asset);
    expect(response.ok(), `${asset} should be served from the built public/ output`).toBeTruthy();
  }

  await page.route('**/sw.js', route => route.abort());
  await page.route('**/basemaps.cartocdn.com/**', route => route.abort());
  await page.route('**/tile.openstreetmap.org/**', route => route.abort());
  await page.route('**/tiles.openfreemap.org/**', route => route.abort());
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');

  await expect(page.locator('#resultsList')).toHaveAttribute('role', 'list');
  await page.locator('#go').click();
  await expect(page.locator('#go')).toBeEnabled();
  const items = page.locator('#resultsList > [role="listitem"]');
  await expect.poll(() => items.count()).toBeGreaterThan(0);
  const count = await items.count();
  for (let index = 0; index < count; index += 1) {
    const item = items.nth(index);
    const buttons = item.locator('button');
    expect(await buttons.count(), 'each listitem should contain a native BUTTON').toBeGreaterThan(0);
    await expect(buttons.first()).toHaveAccessibleName(/\S/);
  }
});
