const { test, expect, devices } = require('@playwright/test');
const { sliderPosition } = require('./helpers');

test.use({ ...devices['iPhone 15'], browserName: 'chromium' });

async function openSettings(page) {
  await page.locator('#jumpSettings').click();
  await page.waitForTimeout(300);
}

async function setTolerance(page, value) {
  await page.locator('#tolerance').evaluate((el, position) => {
    el.value = String(position);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, sliderPosition(value));
}

test.beforeEach(async ({ page }) => {
  await page.route('**/sw.js', route => route.abort());
  await page.route('**/basemaps.cartocdn.com/**', route => route.abort());
  await page.route('**/tile.openstreetmap.org/**', route => route.abort());
  await page.route('**/tiles.openfreemap.org/**', route => route.abort());
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  await openSettings(page);
});

test('the tolerance slider is logarithmic and keeps 0, 300 and Unlimited', async ({ page }) => {
  await expect(page.locator('#tolerance')).toHaveAttribute('min', '0');
  await expect(page.locator('#tolerance')).toHaveAttribute('max', '101');
  await expect(page.locator('#tolerance')).toHaveAttribute('step', '1');

  await setTolerance(page, 0);
  await expect(page.locator('#tolval')).toHaveText('0%');
  await expect(page.locator('#tolerance')).toHaveAttribute('aria-valuetext', '0%');

  await setTolerance(page, 0.1);
  await expect(page.locator('#tolval')).toHaveText('10%');
  await expect(page.locator('#tolerance')).toHaveAttribute('aria-valuetext', '10%');

  await setTolerance(page, 3);
  await expect(page.locator('#tolval')).toHaveText('300%');

  await setTolerance(page, 3.05);
  await expect(page.locator('#tolval')).toHaveText('Unlimited');
});

test('the Fairness toggle switches labels and legend without losing each tolerance', async ({ page }) => {
  await expect(page.locator('#fairnessToggle [data-fairness="time"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#tolval')).toHaveText('10%');
  await expect(page.locator('#legendFairText')).toHaveText('Fair area, darker means shorter travel time');

  await page.locator('#fairnessToggle [data-fairness="fare"]').click();
  await expect(page.locator('#fairnessToggle [data-fairness="fare"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#toleranceLabel')).toContainText('priciest fare');
  await expect(page.locator('#tolval')).toHaveText('25%');
  await expect(page.locator('#legendFairText')).toHaveText('Fair area, darker means cheaper fares');

  await setTolerance(page, 0.4);
  await expect(page.locator('#tolval')).toHaveText('40%');
  await page.locator('#fairnessToggle [data-fairness="time"]').click();
  await expect(page.locator('#tolval')).toHaveText('10%');
  await page.locator('#fairnessToggle [data-fairness="fare"]').click();
  await expect(page.locator('#tolval')).toHaveText('40%');
});

test('fare mode ranks results by fare spread and keeps the heat map', async ({ page }) => {
  await page.locator('#fairnessToggle [data-fairness="fare"]').click();
  await expect(page.locator('#tolval')).toHaveText('25%');
  await page.locator('#go').click();
  await expect.poll(() => page.locator('.result-row').count()).toBeGreaterThan(0);
  await expect.poll(() => page.locator('path.heat-cell').count()).toBeGreaterThan(0);
  await expect(page.locator('#legendFairText')).toHaveText('Fair area, darker means cheaper fares');

  const scores = await page.locator('.result-row').evaluateAll(rows => rows.map(row => {
    const fares = [...row.querySelectorAll('.person-fares .fare')].map(node => Number((node.textContent.match(/[\d.]+/) || [0])[0]));
    const min = Math.min(...fares);
    const max = Math.max(...fares);
    return Math.round((max + (max - min)) * 10) / 10;
  }));
  expect(scores.length).toBeGreaterThan(1);
  expect(scores).toEqual([...scores].sort((a, b) => a - b));
});

test('fare Unlimited hides the heat map and allows a map point', async ({ page }) => {
  await page.locator('#fairnessToggle [data-fairness="fare"]').click();
  await setTolerance(page, 3.05);
  await expect(page.locator('#tolval')).toHaveText('Unlimited');
  await page.locator('#go').click();
  await expect.poll(() => page.locator('.result-row').count()).toBeGreaterThan(0);
  await page.locator('#mobileTabbar [data-mobile-view="map"]').click();
  await expect(page.locator('path.heat-cell')).toHaveCount(0);
  await expect(page.locator('#unboundedHint')).toBeVisible();
  const map = await page.locator('#map').boundingBox();
  await page.touchscreen.tap(map.x + map.width / 2, map.y + map.height / 2);
  await expect(page.locator('#pointBanner')).toBeVisible();
});

test('fare fairness and its tolerance persist across reloads', async ({ page }) => {
  await page.locator('#fairnessToggle [data-fairness="fare"]').click();
  await setTolerance(page, 0.5);
  await page.waitForTimeout(700);
  const stored = await page.evaluate(() => localStorage.getItem('hkfair.v2.settings'));
  expect(stored).toContain('"fairness":"fare"');
  expect(stored).toContain('"fareTolerance":0.5');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  await openSettings(page);
  await expect(page.locator('#fairnessToggle [data-fairness="fare"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#tolval')).toHaveText('50%');
});
