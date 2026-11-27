const { test, expect, devices } = require('@playwright/test');
const { sliderPosition } = require('./helpers');

test.use({ ...devices['iPhone 15'], browserName: 'chromium' });

async function openSettings(page) {
  await page.locator('#jumpSettings').click();
  await expect(page.locator('#optionsHeading')).toBeFocused();
}

// Positions are derived from the single config mapping; the asserted DOM values
// are the published positions, so drift between the two fails this test.
async function setTolerance(page, position) {
  await page.locator('#tolerance').evaluate((el, value) => {
    el.value = String(value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, position);
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

test('the tolerance slider is linear to 100%, logarithmic to 300%, then Unlimited', async ({ page }) => {
  await expect(page.locator('#tolerance')).toHaveAttribute('min', '1');
  await expect(page.locator('#tolerance')).toHaveAttribute('max', '201');
  await expect(page.locator('#tolerance')).toHaveAttribute('step', '1');
  await expect(page.locator('#tolerance ~ .slider-row.ends span').last()).toHaveText('Unlimited');

  await setTolerance(page, await sliderPosition(0.05));
  await expect(page.locator('#tolerance')).toHaveValue('1');
  await expect(page.locator('#tolval')).toHaveText('5%');
  await expect(page.locator('#tolerance')).toHaveAttribute('aria-valuetext', '5%');

  await setTolerance(page, await sliderPosition(0.10));
  await expect(page.locator('#tolerance')).toHaveValue('6');
  await expect(page.locator('#tolval')).toHaveText('10%');
  await expect(page.locator('#tolerance')).toHaveAttribute('aria-valuetext', '10%');

  await setTolerance(page, await sliderPosition(0.15));
  await expect(page.locator('#tolerance')).toHaveValue('11');
  await expect(page.locator('#tolval')).toHaveText('15%');

  await setTolerance(page, await sliderPosition(1));
  await expect(page.locator('#tolerance')).toHaveValue('96');
  await expect(page.locator('#tolval')).toHaveText('100%');

  await setTolerance(page, await sliderPosition(1.01));
  await expect(page.locator('#tolerance')).toHaveValue('97');
  await expect(page.locator('#tolval')).toHaveText('101%');

  await setTolerance(page, await sliderPosition(3));
  await expect(page.locator('#tolerance')).toHaveValue('200');
  await expect(page.locator('#tolval')).toHaveText('300%');

  await setTolerance(page, await sliderPosition(3.05));
  await expect(page.locator('#tolerance')).toHaveValue('201');
  await expect(page.locator('#tolval')).toHaveText('Unlimited');
});

test('the Fairness toggle switches labels and legend without losing each tolerance', async ({ page }) => {
  await expect(page.locator('#fairnessToggle [data-fairness="time"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#tolval')).toHaveText('10%');
  await expect(page.locator('#legendFairText')).toHaveText('Fair area, darker means shorter travel time');

  await page.locator('#fairnessToggle [data-fairness="fare"]').click();
  await expect(page.locator('#fairnessToggle [data-fairness="fare"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#toleranceLabel')).toHaveText('Target fare difference');
  await expect(page.locator('#tolval')).toHaveText('25%');
  await expect(page.locator('#legendFairText')).toHaveText('Fair area, darker means cheaper fares');

  await setTolerance(page, await sliderPosition(0.40));
  await expect(page.locator('#tolval')).toHaveText('40%');
  await page.locator('#fairnessToggle [data-fairness="time"]').click();
  await expect(page.locator('#tolval')).toHaveText('10%');
  await page.locator('#fairnessToggle [data-fairness="fare"]').click();
  await expect(page.locator('#tolval')).toHaveText('40%');
});

test('fare mode ranks results by the displayed fare spread', async ({ page }) => {
  await page.locator('#fairnessToggle [data-fairness="fare"]').click();
  await expect(page.locator('#tolval')).toHaveText('25%');
  await page.locator('#go').click();
  await expect.poll(() => page.locator('.result-row').count()).toBeGreaterThan(0);
  await expect.poll(() => page.locator('path.heat-cell').count()).toBeGreaterThan(0);
  await expect(page.locator('#legendFairText')).toHaveText('Fair area, darker means cheaper fares');

  const spreads = await page.locator('.result-row').evaluateAll(rows => rows.map(row => {
    const label = row.querySelector('.result-times > span')?.textContent || '';
    return Number((label.match(/[\d.]+/) || [0])[0]);
  }));
  expect(spreads.length).toBeGreaterThan(1);
  expect(spreads.every(Number.isFinite)).toBe(true);
  expect(spreads).toEqual([...spreads].sort((a, b) => a - b));
});

test('fare Unlimited keeps the heat map as reference and allows a map point', async ({ page }) => {
  await page.locator('#fairnessToggle [data-fairness="fare"]').click();
  await setTolerance(page, await sliderPosition(3.05));
  await expect(page.locator('#tolval')).toHaveText('Unlimited');
  await page.locator('#go').click();
  await expect.poll(() => page.locator('.result-row').count()).toBeGreaterThan(0);
  await page.locator('#mobileTabbar [data-mobile-view="map"]').click();
  await expect.poll(() => page.locator('path.heat-cell').count()).toBeGreaterThan(0);
  await expect(page.locator('#unboundedHint')).toBeVisible();
  const map = await page.locator('#map').boundingBox();
  await page.touchscreen.tap(map.x + map.width / 2, map.y + map.height / 2);
  await expect(page.locator('#pointBanner')).toBeVisible();
});

test('fare fairness and its tolerance persist across reloads', async ({ page }) => {
  await page.locator('#fairnessToggle [data-fairness="fare"]').click();
  await setTolerance(page, await sliderPosition(0.50));
  await expect.poll(() => page.evaluate(() => localStorage.getItem('hkfair.v2.settings'))).toContain('"fareTolerance":0.5');
  const stored = await page.evaluate(() => localStorage.getItem('hkfair.v2.settings'));
  expect(stored).toContain('"fairness":"fare"');
  expect(stored).toContain('"fareTolerance":0.5');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  await openSettings(page);
  await expect(page.locator('#fairnessToggle [data-fairness="fare"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#tolval')).toHaveText('50%');
});
