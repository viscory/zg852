const { test, expect } = require('@playwright/test');
const { loadSourceModules } = require('./source-modules');

// Browser-only modules imported by i18n.js are never called by the pure
// ranking functions under test here, so they are stubbed for the Node import.
const STUBS = {
  'engine.js': 'export const rerender=()=>{};',
  'state.js': 'export const save=()=>{};',
};

// The production service worker calls clients.claim(), which can take over the
// page mid-test and bypass page.route() for later data fetches. Blocking it here
// keeps the synthetic node/timetable pair deterministic.
test.use({ serviceWorkers: 'block' });

async function openApp(page) {
  await page.route('**/sw.js', route => route.abort());
  await page.route('**/tiles.openfreemap.org/**', route => route.abort());
  await page.route('**/basemaps.cartocdn.com/**', route => route.abort());
  await page.route('**/photon.komoot.io/api/**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ features: [] }),
  }));
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
}

async function search(page) {
  await page.locator('#go').click();
  await expect.poll(() => page.locator('.result-row').count()).toBeGreaterThan(0);
}

async function savedSelection(page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('hkfair.v2.selection');
    return raw ? JSON.parse(raw) : null;
  });
}

test('a chosen result is persisted and restored after a reload', async ({ page }) => {
  await openApp(page);
  await search(page);

  await page.locator('.result-row').nth(2).click();
  await expect(page.locator('.result-row.selected')).toHaveAttribute('data-index', '2');
  await expect.poll(async () => (await savedSelection(page))?.selection?.index).toBe(2);

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  await search(page);
  await expect(page.locator('.result-row.selected')).toHaveAttribute('data-index', '2');
  await expect(page.locator('#detail')).toBeVisible();
});

test('keyboard focus on a heat cell shows its rating tooltip and blur hides it', async ({ page }) => {
  await openApp(page);
  await search(page);

  const index = await page.locator('path.heat-cell').evaluateAll(elements => {
    const map = document.querySelector('#map').getBoundingClientRect();
    return elements.findIndex(element => {
      const box = element.getBoundingClientRect();
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      return box.width > 4 && box.height > 4
        && x > map.left + 20 && x < map.right - 20
        && y > map.top + 20 && y < map.bottom - 20;
    });
  });
  expect(index).toBeGreaterThanOrEqual(0);

  const cell = page.locator('path.heat-cell').nth(index);
  await cell.focus();
  await expect(cell).toHaveAttribute('data-focused', '');
  await expect(page.locator('#mapTooltip')).toBeVisible({ timeout: 3000 });
  await expect(page.locator('#mapTooltip .tooltip-vector').first()).toBeVisible();

  await page.evaluate(() => document.activeElement?.blur());
  await expect(page.locator('#mapTooltip')).toBeHidden();
  await expect(cell).not.toHaveAttribute('data-focused');
});

test('recenter keeps a directly selected heat cell inside the map', async ({ page }) => {
  await openApp(page);
  await search(page);

  const cells = page.locator('path.heat-cell');
  await expect(cells.first()).toBeVisible();
  // Pick the first genuinely hit-testable cell and assert it was selected; a
  // synthetic DOM click is not a substitute for a real user click.
  let point = null;
  await expect.poll(async () => {
    point = await cells.evaluateAll(elements => {
      for (const element of elements) {
        const box = element.getBoundingClientRect();
        if (box.width < 8 || box.height < 8) continue;
        const x = box.x + box.width / 2, y = box.y + box.height / 2;
        const top = document.elementFromPoint(x, y);
        if (top === element || top?.closest?.('.leaflet-interactive') === element) return { x, y };
      }
      return null;
    });
    return point !== null;
  }).toBe(true);
  await page.mouse.click(point.x, point.y);
  await expect.poll(async () => (await savedSelection(page))?.selection?.kind).toBeTruthy();
  await expect(page.locator('.point-pin')).toHaveCount(1);

  await page.locator('.map-recenter-control .map-recenter').click();
  await expect.poll(() => page.evaluate(() => {
    const pin = document.querySelector('.point-pin')?.getBoundingClientRect();
    const map = document.querySelector('#map').getBoundingClientRect();
    if (!pin) return false;
    const x = pin.x + pin.width / 2, y = pin.y + pin.height / 2;
    return x >= map.left + 2 && x <= map.right - 2 && y >= map.top + 2 && y <= map.bottom - 2;
  })).toBe(true);
});

test('route leg text is re-translated when the locale changes', async ({ page }) => {
  await openApp(page);
  await search(page);

  const walkText = page.locator('#steps .walk-leg .ride-text');
  await expect.poll(() => walkText.count()).toBeGreaterThan(0);
  const before = await walkText.allInnerTexts();
  expect(before.join(' ')).toMatch(/Walk/);

  await page.locator('#locale').selectOption('zh-Hant');
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hant');
  await expect.poll(async () => (await walkText.allInnerTexts()).join(' ')).toMatch(/步行/);
  const after = await walkText.allInnerTexts();
  expect(after).not.toEqual(before);
});

test('travel time wins even when a bus stop beats an MTR exit', async () => {
  const [{ rideMode }, { compareAreaRank, areaRank }] = await loadSourceModules(['routing.js', 'model.js'], STUBS);
  expect(rideMode(0)).toBe('rail');
  expect(rideMode(1)).toBe('bus');
  // The bus-stop area is faster on every displayed time; the station area has
  // the higher-priority node kind. Ranking must follow the visible times.
  const busStop = { key: 'bus', kind: 4, fitScore: 24, shownSlowest: 20, shownGap: 4 };
  const mtrStation = { key: 'rail', kind: 1, fitScore: 36, shownSlowest: 30, shownGap: 6 };
  expect(compareAreaRank(busStop, mtrStation)).toBeLessThan(0);
  expect(compareAreaRank(mtrStation, busStop)).toBeGreaterThan(0);
  expect(areaRank(busStop)).toEqual([24, 20, 4, 'bus']);
  expect(areaRank(mtrStation)).toEqual([36, 30, 6, 'rail']);
  // At equal displayed times, node kind and priority cannot break the tie.
  const exit = { key: 'cell', kind: 1, priority: 3, fitScore: 26, shownSlowest: 22, shownGap: 4 };
  const stop = { key: 'cell', kind: 4, priority: 1, fitScore: 26, shownSlowest: 22, shownGap: 4 };
  expect(areaRank(exit)).toEqual(areaRank(stop));
  expect(compareAreaRank(exit, stop)).toBe(0);
});

test.describe('narrow fine-pointer desktops use the adaptive deck', () => {
  test.use({ viewport: { width: 800, height: 600 } });

  test('the stacked fallback no longer replaces the deck', async ({ page }) => {
    await openApp(page);
    await expect(page.locator('#mobileTabbar')).toBeVisible();
    await expect(page.locator('.layout')).toHaveCSS('display', 'block');
    // The map stays a real, usable destination at this breakpoint.
    await page.locator('#mobileTabbar [data-mobile-view="map"]').click();
    await expect(page.locator('body')).toHaveAttribute('data-mobile-view', 'map');
    await expect(page.locator('#map')).toBeVisible();
  });

  test('legend keys stay visible and long tolerance labels wrap', async ({ page }) => {
    await openApp(page);
    await page.locator('#locale').selectOption('de');
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
    const label = await page.locator('.tolerance-row label').evaluate(element => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      overflow: getComputedStyle(element).overflow,
    }));
    expect(label.overflow).not.toBe('hidden');
    expect(label.scrollHeight).toBeLessThanOrEqual(label.clientHeight + 1);

    await page.locator('#mobileTabbar [data-mobile-view="map"]').click();
    const keyDisplays = await page.evaluate(() => ['.legend .route-key', '.legend .pin-key', '.legend .recenter-key']
      .map(selector => getComputedStyle(document.querySelector(selector)).display));
    expect(keyDisplays.every(display => display !== 'none')).toBe(true);
  });
});
