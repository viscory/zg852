const { test, expect } = require('@playwright/test');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');
// Read the real workflow so this spec fails if a required CI step is removed.
const CI_WORKFLOW = readFileSync(join(root, '.github', 'workflows', 'ci.yml'), 'utf8');

test('CI workflow runs lint, build, test and deploy', () => {
  for (const step of ['npm run lint', 'npm run build', 'npm test', 'npx wrangler pages deploy public']) {
    expect(CI_WORKFLOW, `${step} should be present in .github/workflows/ci.yml`).toContain(step);
  }
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
    await expect(item).toHaveAttribute('role', 'listitem');
    const buttons = item.locator('button');
    expect(await buttons.count(), 'each listitem should contain a native BUTTON').toBeGreaterThan(0);
    await expect(buttons.first()).toHaveAccessibleName(/\S/);
  }
});
