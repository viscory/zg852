const { test, expect } = require('@playwright/test');

// This suite deliberately never calls page.route(): it verifies what the app
// actually does against the real tile and geocoder services. The other suites
// block those hosts to keep their fixtures deterministic.
test.describe('real network', () => {
  test.skip(!!process.env.CI, 'the public tile and geocoder services are unreliable in CI');

  test('a clean load renders real tiles, a real search renders heat cells, and only expected hosts are contacted', async ({ page }) => {
    const baseURL = test.info().project.use?.baseURL || process.env.TEST_BASE_URL || 'http://127.0.0.1:8765';
    const firstParty = new URL(baseURL).host;
    const tilesHost = 'tiles.openfreemap.org';
    const hosts = new Set();
    const tileResponses = [];

    page.on('request', request => {
      if (/^https?:/.test(request.url())) hosts.add(new URL(request.url()).host);
    });
    page.on('response', response => {
      if (new URL(response.url()).host === tilesHost && response.ok()) tileResponses.push(response.url());
    });

    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
    await expect(page.locator('.maplibregl-canvas')).toBeVisible();
    await expect.poll(() => tileResponses.length, { timeout: 20000 }).toBeGreaterThan(0);
    expect([...hosts].filter(host => host !== firstParty && host !== tilesHost)).toEqual([]);

    // Default two-person scenario, no fixture and no route blocking.
    await page.locator('#go').click();
    await expect.poll(() => page.locator('.result-row').count()).toBeGreaterThan(0);
    await expect(page.locator('path.heat-cell').first()).toBeVisible();

    // A real search must not contact any host beyond first-party and tiles.
    // Geocoder behaviour is covered by the other suites with deterministic
    // responses; this suite only asserts the real tile/search path.
    expect([...hosts].filter(host => host !== firstParty && host !== tilesHost)).toEqual([]);
  });
});
