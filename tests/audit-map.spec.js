const { test, expect, devices } = require('@playwright/test');

test.use({ ...devices['iPhone 15'], browserName: 'chromium' });

test.beforeEach(async ({ page }) => {
  await page.route('**/sw.js', route => route.abort());
  await page.route('**/basemaps.cartocdn.com/**', route => route.abort());
  await page.route('**/tile.openstreetmap.org/**', route => route.abort());
  await page.route('**/tiles.openfreemap.org/**', route => route.abort());
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
});

async function search(page) {
  await page.locator('#go').click();
  await expect.poll(() => page.locator('.result-row').count()).toBeGreaterThan(0);
  await expect.poll(() => page.locator('path.heat-cell').count()).toBeGreaterThan(0);
}

async function mapGeometry(page) {
  return page.evaluate(() => {
    const map = document.querySelector('#map').getBoundingClientRect();
    const tab = document.querySelector('#mobileTabbar').getBoundingClientRect();
    const card = document.querySelector('.side-left');
    const cardBox = getComputedStyle(card).display === 'none' ? null : card.getBoundingClientRect();
    const pin = document.querySelector('.point-pin')?.getBoundingClientRect();
    const routes = [...document.querySelectorAll('path.route-line')].map(el => {
      const box = el.getBoundingClientRect();
      return { top: box.top, bottom: box.bottom, left: box.left, right: box.right };
    });
    return {
      mapTop: map.top,
      mapBottom: map.bottom,
      tabTop: tab.top,
      visibleBottom: cardBox ? Math.min(cardBox.top, map.bottom) : map.bottom,
      pin: pin ? { top: pin.top, bottom: pin.bottom, left: pin.left, right: pin.right } : null,
      routes,
    };
  });
}

function pinIsVisible(geo, width) {
  return Boolean(geo.pin)
    && geo.pin.top >= geo.mapTop - 4
    && geo.pin.bottom <= geo.visibleBottom - 4
    && geo.pin.left >= -4
    && geo.pin.right <= width + 4;
}

function routesAreVisible(geo, width) {
  return geo.routes.length > 0 && geo.routes.every(route =>
    route.top >= geo.mapTop - 8
    && route.bottom <= geo.visibleBottom + 8
    && route.left >= -8
    && route.right <= width + 8);
}

test('selecting a result fits the marker and routes above the route card, and recenter keeps them there', async ({ page }) => {
  await search(page);
  await page.locator('.result-row').nth(1).click();
  await expect(page.locator('body')).toHaveAttribute('data-mobile-view', 'map');
  await expect(page.locator('body')).toHaveClass(/mobile-route-open/);

  const width = await page.evaluate(() => window.innerWidth);
  await expect.poll(async () => {
    const geo = await mapGeometry(page);
    return pinIsVisible(geo, width) && routesAreVisible(geo, width);
  }).toBe(true);
  const before = await mapGeometry(page);
  expect(before.pin).not.toBeNull();
  expect(before.routes.length).toBeGreaterThan(0);

  const startValues = page.locator('.start-input');
  const starts = await startValues.evaluateAll(els => els.map(el => el.value));
  await page.locator('.map-recenter-control .map-recenter').click();
  await expect.poll(async () => {
    const geo = await mapGeometry(page);
    return pinIsVisible(geo, width) && routesAreVisible(geo, width);
  }).toBe(true);
  expect(await startValues.evaluateAll(els => els.map(el => el.value))).toEqual(starts);
});

test('heat cells are labelled, roving-focusable and keyboard-activatable', async ({ page }) => {
  await search(page);
  // A grid of hundreds of cells must expose one tab stop, not hundreds.
  await expect(page.locator('path.heat-cell[tabindex="0"]')).toHaveCount(1);
  await expect(page.locator('path.heat-cell[tabindex="-1"]').first()).toBeAttached();
  const cell = page.locator('path.heat-cell[tabindex="0"]').first();
  await expect(cell).toHaveAttribute('role', 'button');
  await expect(cell).toHaveAttribute('aria-label', /^Meeting area: \d+ min$/);

  await page.locator('#mobileTabbar [data-mobile-view="map"]').click();
  await expect(page.locator('body')).toHaveAttribute('data-mobile-view', 'map');
  await cell.focus();
  await expect(cell).toHaveAttribute('data-focused', '');
  await page.keyboard.press('Enter');
  await expect(page.locator('body')).toHaveClass(/mobile-route-open/);
  await expect(page.locator('#detail')).toBeVisible();

  await page.locator('#closeRoute').click();
  await expect(page.locator('body')).not.toHaveClass(/mobile-route-open/);
  await cell.focus();
  await page.keyboard.press('Space');
  await expect(page.locator('body')).toHaveClass(/mobile-route-open/);
});

test('an unbounded tap before Search reports that data is still loading without selecting a point', async ({ page }) => {
  await page.evaluate(() => {
    const slider = document.querySelector('#tolerance');
    slider.value = '201';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.locator('#mobileTabbar [data-mobile-view="map"]').click();
  const mapBox = await page.locator('#map').boundingBox();
  expect(mapBox).not.toBeNull();
  await page.mouse.click(mapBox.x + mapBox.width / 2, mapBox.y + 100);
  const snapshot = await page.evaluate(() => {
    const error = document.querySelector('#error');
    return {
      errorHidden: error.hidden,
      errorText: error.textContent,
      bannerHidden: document.querySelector('#pointBanner').hidden,
      detailHidden: document.querySelector('#detail').hidden,
      pins: document.querySelectorAll('.point-pin').length,
    };
  });
  expect(snapshot.errorHidden).toBe(false);
  expect(snapshot.errorText).toBe('The timetable is still loading.');
  expect(snapshot.bannerHidden).toBe(true);
  expect(snapshot.detailHidden).toBe(true);
  expect(snapshot.pins).toBe(0);
  // #error is display:none on this mobile profile; the shared live region is
  // what the user actually sees, so assert its visible feedback as well.
  await expect(page.locator('#mobileError')).toBeVisible();
  await expect(page.locator('#mobileError')).toHaveText('The timetable is still loading.');
  await page.locator('#mobileTabbar [data-mobile-view="plan"]').click();
  await page.locator('#go').click();
  await expect.poll(() => page.locator('.result-row').count()).toBeGreaterThan(0);
  await page.locator('#mobileTabbar [data-mobile-view="map"]').click();
  await expect(page.locator('#unboundedHint')).toBeVisible();
});
