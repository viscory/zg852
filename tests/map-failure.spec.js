const { test, expect, devices } = require('@playwright/test');

// The shared error live region is only rendered at mobile breakpoints, so this
// suite uses the mobile profile while forcing map startup to fail.
test.use({ ...devices['iPhone 15'], browserName: 'chromium', launchOptions: { args: ['--disable-webgl', '--disable-webgl2', '--disable-gpu'] } });

test.beforeEach(async ({ page }) => {
  await page.route('**/sw.js', route => route.abort());
  await page.route('**/tiles.openfreemap.org/**', route => route.abort());
  await page.route('**/photon.komoot.io/api/**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ features: [] }),
  }));
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
});

async function pickStation(page, index, name) {
  const card = page.locator('.card').nth(index);
  await card.locator('.start-input').fill(name);
  const row = card.locator('.suggestion').filter({ hasText: name }).first();
  await expect(row).toBeVisible();
  await row.click();
}

test('search still lists areas when the map cannot start', async ({ page }) => {
  await expect(page.locator('#error')).toContainText('The map failed to start');
  // #error is display:none on mobile; assert the user-visible live region too.
  await expect(page.locator('#mobileError')).toBeVisible();
  await expect(page.locator('#mobileError')).toContainText('The map failed to start');
  await pickStation(page, 0, 'Central');
  await pickStation(page, 1, 'Sha Tin');
  await expect.poll(() => page.locator('.result-row').count()).toBeGreaterThan(0);
  await expect(page.locator('#error')).toBeHidden();
});
