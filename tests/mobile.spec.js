const { test, expect, devices } = require('@playwright/test');

test.use({ ...devices['iPhone 15'], browserName: 'chromium' });

async function setRange(page, id, value) {
  await page.locator(id).evaluate((el, next) => {
    el.value = next;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
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
  await expect(page.locator('#mapLegend')).not.toHaveAttribute('open', '');

  await page.locator('#mobileTabbar [data-mobile-view="plan"]').click();
  await expect(page.locator('body')).toHaveAttribute('data-mobile-view', 'plan');
  await expect(page.locator('.side-left')).toBeVisible();
  await expect(page.locator('#mobileTabbar [data-mobile-view="plan"]')).toHaveAttribute('aria-current', 'page');
});

test('search moves to Fair areas and a result opens the route card on Map', async ({ page }) => {
  await page.locator('#go').click();
  await waitForSearch(page, { heat: true });
  await expect(page.locator('body')).toHaveAttribute('data-mobile-view', 'results');
  await expect(page.locator('#nres')).toHaveText('7 areas');
  await expect(page.locator('#mobileScenarioText')).toHaveText('Tsuen Wan → North Point');
  await expect(page.locator('.result-row')).toHaveCount(7);

  await page.locator('.result-row[data-index="0"]').click();
  await expect(page.locator('body')).toHaveAttribute('data-mobile-view', 'map');
  await expect(page.locator('body')).toHaveClass(/mobile-route-open/);
  await expect(page.locator('#detail')).toBeVisible();
  await expect(page.locator('#detailTitle')).not.toBeEmpty();
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
  await expect(page.locator('#tolerance')).toHaveValue('0.1');

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
});

test('bounded heat tap opens the route card with bar-only ratings', async ({ page }) => {
  await page.locator('#go').click();
  await waitForSearch(page, { heat: true });
  await page.locator('#mobileTabbar [data-mobile-view="map"]').click();
  await page.waitForTimeout(500);
  const target = await page.evaluate(() => {
    for (const el of document.querySelectorAll('path.heat-cell')) {
      const box = el.getBoundingClientRect();
      if (box.width < 12 || box.height < 12 || box.top < 70 || box.top > innerHeight - 80) continue;
      const x = box.left + box.width / 2;
      const y = box.top + box.height / 2;
      const top = document.elementFromPoint(x, y);
      if (top === el || top?.closest?.('.leaflet-interactive') === el) return { x, y };
    }
    return null;
  });
  expect(target).not.toBeNull();
  await page.touchscreen.tap(target.x, target.y);
  await expect(page.locator('body')).toHaveClass(/mobile-route-open/);
  await page.locator('#toggleRoute').click();
  await expect(page.locator('#interestRatings')).toBeVisible();
  await page.locator('#interestRatings summary').click();
  await expect(page.locator('#fitGrid .fit-row')).toHaveCount(6);
  await expect(page.locator('#interestRatings')).not.toContainText('/100');
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

test('focusing a start hides the bars and keeps suggestions above the keyboard', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 664 });
  const input = page.locator('#start-p1');
  await input.focus();
  await expect(page.locator('body')).toHaveClass(/keyboard-open/);
  await expect(page.locator('#mobileTabbar')).toBeHidden();
  await expect(page.locator('#go')).toBeHidden();
  await input.fill('Central');
  await expect(page.locator('#suggest-p1')).toBeVisible();
  const box = await input.boundingBox();
  expect(box.y).toBeLessThan(664 - 300);
});
