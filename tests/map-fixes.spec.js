const { test, expect } = require('@playwright/test');

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

test('travel time wins even when a bus stop beats an MTR exit', async ({ page }) => {
  // A tiny synthetic network makes the timing difference deterministic: both
  // candidates are 10-ish minutes from both origins and the bus is 0.5 min
  // faster. Node kind no longer breaks ties; the visible times do. One wildcard route keeps
  // the node list and timetable in sync; separate routes can race and let the
  // real timetable load against only four synthetic nodes.
  const line = (l, n, c, s, e) => ({ l, n, c, w: 0, h: 0, s, e, g: [] });
  const stubs = {
    'nodes.json': {
      names: ['Tsuen Wan', 'North Point', 'MTR Exit', 'Bus Interchange'],
      kind: [1, 1, 3, 4],
      lat: [22.37, 22.29, 22.31, 22.33],
      lon: [114.11, 114.22, 114.15, 114.17],
    },
    'network.json': {
      walk: [],
      lines: [
        line('TWL', 'Rail out', 0, [0, 2, 1], [10.5, 10.5]),
        line('TWL-R', 'Rail back', 0, [1, 2, 0], [10.5, 10.5]),
        line('B1', 'Bus out', 1, [0, 3, 1], [10, 10]),
        line('B2', 'Bus back', 1, [1, 3, 0], [10, 10]),
      ],
    },
    'hkbus.json': [],
    'districts.json': [],
    'poi-index.json': { cells: {} },
    // Fare tables belong to the same four-node graph; one fixture serves every
    // data file so none of them can fall through to the real bundle's data.
    'mtr-fares.json': { fares: {}, aelFares: {}, nodeStation: {}, stationIds: [] },
    'route-fares.json': { fares: {} },
  };
  await page.route('**/data/*.json', route => {
    const name = new URL(route.request().url()).pathname.split('/').pop();
    return stubs[name] ? route.fulfill({ json: stubs[name] }) : route.continue();
  });

  await openApp(page);
  await search(page);

  const labels = await page.locator('.result-row .result-head b').allInnerTexts();
  expect(labels.slice(0, 2)).toEqual(['Bus Interchange', 'MTR Exit']);
});

test.describe('narrow fine-pointer desktops use the adaptive deck', () => {
  test.use({ viewport: { width: 800, height: 600 } });

  test('the stacked fallback no longer replaces the deck', async ({ page }) => {
    await openApp(page);
    expect(await page.evaluate(() => document.documentElement.hasAttribute('data-mobile-layout'))).toBe(true);
    await expect(page.locator('#mobileTabbar')).toBeVisible();
    await expect(page.locator('.layout')).toHaveCSS('display', 'block');
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
