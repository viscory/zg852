const { test, expect, devices } = require('@playwright/test');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { sliderPosition } = require('./helpers');
const { loadSourceModule } = require('./source-modules');

const EN_CATALOGUE = JSON.parse(readFileSync(join(__dirname, '..', 'static', 'i18n', 'en.json'), 'utf8'));

test.use({ ...devices['iPhone 15'], browserName: 'chromium' });

async function setRange(page, id, value) {
  const next = id === '#tolerance' ? await sliderPosition(Number(value)) : value;
  await page.locator(id).evaluate((el, n) => {
    el.value = n;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, next);
}

async function waitForSearch(page, { heat = false } = {}) {
  await expect(page.locator('#go')).toBeEnabled();
  await expect.poll(() => page.locator('.result-row').count()).toBeGreaterThan(0);
  if (heat) await expect.poll(() => page.locator('path.heat-cell').count()).toBeGreaterThan(0);
}

function overlaps(a, b) {
  return !(a.right <= b.x || a.x >= b.right || a.bottom <= b.y || a.y >= b.bottom);
}

async function rect(locator) {
  const box = await locator.boundingBox();
  return { ...box, right: box.x + box.width, bottom: box.y + box.height };
}

// Pick a point that really hits a heat cell. Only real hit-testing is used:
// sample points inside positive-size, on-screen cells and accept whichever
// heat cell is topmost. No invented viewport bands or minimum pixel sizes.
async function visibleHeatTarget(page) {
  const target = await page.evaluate(() => {
    for (const element of document.querySelectorAll('path.heat-cell')) {
      const style = getComputedStyle(element);
      if (style.visibility === 'hidden' || style.display === 'none') continue;
      const box = element.getBoundingClientRect();
      if (box.width <= 0 || box.height <= 0) continue;
      for (const fx of [0.5, 0.35, 0.65]) {
        for (const fy of [0.5, 0.35, 0.65]) {
          const x = box.left + box.width * fx;
          const y = box.top + box.height * fy;
          const top = document.elementFromPoint(x, y);
          if (top?.closest?.('path.heat-cell')) return { x, y };
        }
      }
    }
    return null;
  });
  expect(target, 'a visible heat cell should be tappable').not.toBeNull();
  return target;
}

test.beforeEach(async ({ page }) => {
  await page.route('**/sw.js', route => route.abort());
  await page.route('**/basemaps.cartocdn.com/**', route => route.abort());
  await page.route('**/tile.openstreetmap.org/**', route => route.abort());
  await page.route('**/tiles.openfreemap.org/**', route => route.abort());
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
});

test('opens on Plan with no map, a reachable CTA and 44px controls', async ({ page }) => {
  await expect(page.locator('#mobileTabbar')).toBeVisible();
  await expect(page.locator('body')).toHaveAttribute('data-mobile-view', 'plan');
  await expect(page.locator('.side-left')).toBeVisible();
  await expect(page.locator('.side-right')).toBeVisible();
  await expect(page.locator('.main')).toBeHidden();
  await expect(page.locator('#go')).toBeVisible();

  const metrics = await page.evaluate(() => {
    const controls = [...document.querySelectorAll('button,select,input[type=text],input[type=range],a')]
      .filter(el => el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0);
    const small = controls.filter(el => {
      const box = el.getBoundingClientRect();
      return box.width < 44 || box.height < 44;
    }).map(el => `${el.tagName}#${el.id}.${el.className}`.slice(0, 80));
    const go = document.querySelector('#go').getBoundingClientRect();
    const tab = document.querySelector('#mobileTabbar').getBoundingClientRect();
    return {
      innerHeight: window.innerHeight,
      overflow: document.documentElement.scrollWidth > window.innerWidth,
      goBottom: go.bottom,
      tabTop: tab.top,
      small,
    };
  });
  expect(metrics.overflow).toBe(false);
  expect(metrics.goBottom).toBeLessThanOrEqual(metrics.tabTop + 1);
  expect(metrics.small).toEqual([]);
});

test('the three tabs are real destinations and show exactly one job', async ({ page }) => {
  const tabs = page.locator('#mobileTabbar [data-mobile-view]');
  await expect(tabs).toHaveCount(3);
  await expect(page.locator('#mobileTabbar [data-mobile-view="plan"]')).toHaveAttribute('aria-current', 'page');

  await page.locator('#mobileTabbar [data-mobile-view="results"]').click();
  await expect(page.locator('body')).toHaveAttribute('data-mobile-view', 'results');
  await expect(page.locator('.side-right')).toBeVisible();
  await expect(page.locator('.side-left')).toBeHidden();
  await expect(page.locator('.main')).toBeHidden();
  await expect(page.locator('#mobileResultsEmpty')).toBeVisible();
  await expect(page.locator('#resultState')).toBeHidden();

  await page.locator('#mobileTabbar [data-mobile-view="map"]').click();
  await expect(page.locator('body')).toHaveAttribute('data-mobile-view', 'map');
  await expect(page.locator('.main')).toBeVisible();
  await expect(page.locator('.side-right')).toBeHidden();
  await expect(page.locator('.side-left')).toBeHidden();
  await expect(page.locator('#mapLegend')).not.toHaveClass(/open/);
  await expect(page.locator('#legendToggle')).toHaveAttribute('aria-expanded', 'false');

  await page.locator('#mobileTabbar [data-mobile-view="plan"]').click();
  await expect(page.locator('body')).toHaveAttribute('data-mobile-view', 'plan');
  await expect(page.locator('.side-left')).toBeVisible();
  await expect(page.locator('#mobileTabbar [data-mobile-view="plan"]')).toHaveAttribute('aria-current', 'page');

  // Returning to an empty Fair areas screen must never leave a blank page.
  await page.locator('#mobileTabbar [data-mobile-view="results"]').click();
  await expect(page.locator('#mobileResultsEmpty')).toBeVisible();
  await expect(page.locator('#mobileEmptyTitle')).toHaveText('No fair areas yet.');
});

test('search moves to Fair areas and a result opens the route card on Map', async ({ page }) => {
  const { RESULTS_LIMIT } = await loadSourceModule('config.js');
  await page.locator('#go').click();
  await waitForSearch(page, { heat: true });
  await expect(page.locator('body')).toHaveAttribute('data-mobile-view', 'results');
  const rows = await page.locator('.result-row').count();
  await expect(page.locator('#nres')).toHaveText(EN_CATALOGUE['results.header'].replace('{count}', String(rows)));
  await expect(page.locator('#mobileScenarioText')).toHaveText('Tsuen Wan → North Point');
  // Cap regression: the expected count comes from the app's own RESULTS_LIMIT
  // constant, so the test and the engine cannot drift apart silently.
  await expect(page.locator('.result-row')).toHaveCount(RESULTS_LIMIT);

  await page.locator('.result-row[data-index="0"]').click();
  await expect(page.locator('body')).toHaveAttribute('data-mobile-view', 'map');
  await expect(page.locator('body')).toHaveClass(/mobile-route-open/);
  await expect(page.locator('#detail')).toBeVisible();
  await expect(page.locator('#detailTitle')).not.toBeEmpty();
  const strokes = await page.evaluate(() => [...new Set([...document.querySelectorAll('path.route-line')].map(line => line.getAttribute('stroke')))]);
  expect(strokes.length).toBeGreaterThan(1);
  const card = await rect(page.locator('.side-left'));
  const map = await rect(page.locator('#map'));
  expect(card.height).toBeLessThanOrEqual(map.height * 0.4);
  await expect(page.locator('#steps')).toBeHidden();
  await expect(page.locator('#interestRatings')).toBeHidden();
  await expect(page.locator('#toggleRoute')).toHaveAttribute('aria-expanded', 'false');

  await page.locator('#toggleRoute').click();
  await expect(page.locator('#toggleRoute')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#steps')).toBeVisible();
  await expect(page.locator('#interestRatings')).toBeVisible();
  const expanded = await rect(page.locator('.side-left'));
  expect(expanded.height).toBeGreaterThan(card.height);

  await page.locator('#closeRoute').click();
  await expect(page.locator('body')).not.toHaveClass(/mobile-route-open/);
  await expect(page.locator('.side-left')).toBeHidden();
  await expect(page.locator('#mapLegend')).toBeVisible();
});

test('Plan settings are all reachable in one scroll and the CTA never covers them', async ({ page }) => {
  const layout = page.locator('.layout');
  await layout.evaluate(el => { el.scrollTop = el.scrollHeight; });
  await expect(page.locator('#tolerance')).toBeVisible();
  await expect(page.locator('#includeHeadway')).toBeVisible();
  await expect(page.locator('#tolval')).toHaveText('10%');

  const go = await rect(page.locator('#go'));
  const headway = await rect(page.locator('.toggle-row'));
  const tolerance = await rect(page.locator('#tolerance'));
  expect(overlaps(go, headway)).toBe(false);
  expect(overlaps(go, tolerance)).toBe(false);
  expect(await page.locator('#optionsHeading').textContent()).toBe('Trip settings');
  await expect(page.locator('#mobileBeta')).toBeVisible();
});

test('Pin opens the Map in picking mode and returns to Plan after a tap', async ({ page }) => {
  await page.locator('button[aria-label="Pin"]').first().click();
  await expect(page.locator('body')).toHaveAttribute('data-mobile-view', 'map');
  await expect(page.locator('body')).toHaveClass(/mobile-picking/);
  await expect(page.locator('#mobileTabbar')).toBeHidden();
  await expect(page.locator('#pinBanner')).toBeVisible();
  const map = await page.locator('#map').boundingBox();
  expect(map.height).toBeGreaterThan(500);

  await page.touchscreen.tap(map.x + map.width / 2, map.y + map.height / 2);
  await expect(page.locator('body')).toHaveAttribute('data-mobile-view', 'plan');
  await expect(page.locator('body')).not.toHaveClass(/mobile-picking/);
  await expect(page.locator('#mobileTabbar')).toBeVisible();
  await expect(page.locator('#start-p1')).toHaveValue(/^Pinned point/);
});

test('the Plan header explains the app and links to Trip settings', async ({ page }) => {
  await expect(page.locator('.brand-tagline')).toBeVisible();
  await expect(page.locator('.brand-tagline')).toHaveText('Find a fair place to meet');
  await expect(page.locator('.brand h1 .jyutping')).toBeVisible();
  await page.locator('#jumpSettings').click();
  await expect(page.locator('#optionsHeading')).toBeInViewport();
  await expect(page.locator('#optionsHeading')).toBeFocused();
  await expect(page.locator('#optionsHeading')).toHaveText('Trip settings');
});

test('a validation error is visible above the tabs, not buried in a scroller', async ({ page }) => {
  await page.locator('button[aria-label="Remove person B"]').click();
  await page.locator('#go').click();
  await expect(page.locator('body')).toHaveAttribute('data-mobile-view', 'results');
  await expect(page.locator('#mobileError')).toBeVisible();
  await expect(page.locator('#mobileError')).toContainText('Add at least two people');
  const toast = await rect(page.locator('#mobileError'));
  const tab = await rect(page.locator('#mobileTabbar'));
  expect(toast.bottom).toBeLessThanOrEqual(tab.y + 1);
  await expect(page.locator('#mobileResultsEmpty')).toBeVisible();
});

test('no-results card explains the failure instead of repeating setup instructions', async ({ page }) => {
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  await page.locator('#start-p2').fill('Cheung Chau');
  await expect(page.locator('#suggest-p2 .suggestion').first()).toBeVisible();
  await page.locator('#suggest-p2 .suggestion').first().click();
  await page.locator('#go').click();
  await expect(page.locator('body')).toHaveAttribute('data-mobile-view', 'results');
  await expect(page.locator('#mobileEmptyHint')).toContainText('150 minutes');
  await expect(page.locator('#mobileEmptyHint')).not.toContainText('Set up who is meeting');
});

test('beta parameters stay in Plan and do not collide with the CTA', async ({ page }) => {
  await page.locator('#mobileBeta').click();
  await expect(page.locator('#vectorSection')).toBeVisible();
  await expect(page.locator('#mobileBeta')).toHaveAttribute('aria-pressed', 'true');
  const layout = page.locator('.layout');
  await layout.evaluate(el => { el.scrollTop = el.scrollHeight; });
  await expect(page.locator('#vec-shopping')).toBeVisible();
  const go = await rect(page.locator('#go'));
  const shopping = await rect(page.locator('.vector-row:has(#vec-shopping)'));
  expect(overlaps(go, shopping)).toBe(false);

  // The avoid/off/prefer labels belong under the slider, not spread over the row.
  const slider = await rect(page.locator('.vector-row').first().locator('input[type=range]'));
  const ends = await rect(page.locator('.vector-ends-track'));
  expect(Math.abs(ends.x - slider.x)).toBeLessThanOrEqual(2);
  expect(Math.abs(ends.width - slider.width)).toBeLessThanOrEqual(2);
});

test('bounded heat tap opens the route card with bar-only ratings', async ({ page }) => {
  await page.locator('#go').click();
  await waitForSearch(page, { heat: true });
  await page.locator('#mobileTabbar [data-mobile-view="map"]').click();
  await expect(page.locator('#map')).toBeVisible();
  await expect(page.locator('path.heat-cell').first()).toBeVisible();
  const target = await visibleHeatTarget(page);
  await page.touchscreen.tap(target.x, target.y);
  await expect(page.locator('body')).toHaveClass(/mobile-route-open/);
  await page.locator('#toggleRoute').click();
  await expect(page.locator('#interestRatings')).toBeVisible();
  await page.locator('#interestToggle').click();
  await expect(page.locator('#fitGrid .fit-row')).toHaveCount(6);
  await expect(page.locator('#interestRatings')).not.toContainText('/100');
  const meters = await page.locator('#fitGrid .fit-row').evaluateAll(rows => rows.map(row => ({
    role: row.getAttribute('role'),
    label: row.getAttribute('aria-label'),
    now: Number(row.getAttribute('aria-valuenow')),
  })));
  expect(meters.every(meter => meter.role === 'meter' && /:\s*\d+%$/.test(meter.label || '') && Number.isFinite(meter.now))).toBe(true);
});

test('unbounded point tap shows a route card without scores', async ({ page }) => {
  await setRange(page, '#tolerance', '3.05');
  await expect(page.locator('#tolval')).toHaveText('Unlimited');
  await page.locator('#go').click();
  await waitForSearch(page);
  await page.locator('#mobileTabbar [data-mobile-view="map"]').click();
  await expect(page.locator('#unboundedHint')).toBeVisible();
  const map = await page.locator('#map').boundingBox();
  await page.touchscreen.tap(map.x + map.width / 2, map.y + map.height / 2);
  await expect(page.locator('#pointBanner')).toBeVisible();
  await expect(page.locator('body')).toHaveClass(/mobile-route-open/);
  await expect(page.locator('#interestRatings')).not.toContainText('/100');
});

test('an expanded route card scrolls to the fare disclaimer instead of clipping it', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.locator('#go').click();
  await waitForSearch(page, { heat: true });
  await page.locator('#mobileTabbar [data-mobile-view="map"]').click();
  await expect(page.locator('#map')).toBeVisible();
  await expect(page.locator('path.heat-cell').first()).toBeVisible();
  const target = await visibleHeatTarget(page);
  await page.touchscreen.tap(target.x, target.y);
  await expect(page.locator('body')).toHaveClass(/mobile-route-open/);
  await page.locator('#toggleRoute').click();
  await expect(page.locator('.fare-note')).toBeVisible();

  const scroller = page.locator('#flipStage');
  const metrics = await scroller.evaluate(el => ({ scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }));
  expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);
  await scroller.evaluate(el => { el.scrollTop = el.scrollHeight; });
  await expect(page.locator('.fare-note')).toBeInViewport();
});

test('focusing a start hides the bars and keeps suggestions above the fixed controls', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 664 });
  // Both bars hide on focus, so record their real position beforehand and
  // require the field to stay above it instead of guessing a keyboard height.
  const tab = await rect(page.locator('#mobileTabbar'));
  const go = await rect(page.locator('#go'));
  const fixedTop = Math.min(tab.y, go.y);
  const input = page.locator('#start-p1');
  await input.focus();
  await expect(page.locator('body')).toHaveClass(/keyboard-open/);
  await expect(page.locator('#mobileTabbar')).toBeHidden();
  await expect(page.locator('#go')).toBeHidden();
  await input.fill('Central');
  await expect(page.locator('#suggest-p1')).toBeVisible();
  const box = await input.boundingBox();
  expect(box).not.toBeNull();
  expect(box.y + box.height).toBeLessThanOrEqual(fixedTop + 1);
});
