const { test, expect } = require('@playwright/test');
const { readFileSync, readdirSync } = require('node:fs');
const { join } = require('node:path');
const { loadSourceModule, loadSourceModules } = require('./source-modules');

const root = join(__dirname, '..');
const catalogue = file => JSON.parse(readFileSync(join(root, 'static', 'i18n', file), 'utf8'));
const catalogues = () => readdirSync(join(root, 'static', 'i18n'))
  .filter(file => file.endsWith('.json'))
  .map(file => [file, catalogue(file)]);
const en = catalogue('en.json');

// Browser-only modules imported by i18n.js are never called by the pure
// functions under test here, so they are stubbed for the Node-side import.
const stubs = {
  'engine.js': 'export const rerender=()=>{};',
  'state.js': 'export const save=()=>{};',
};
const model = () => loadSourceModule('model.js');
const config = () => loadSourceModule('config.js');

test.use({ serviceWorkers: 'block' });

async function shareUrl(page, state) {
  const origin = await page.evaluate(() => location.origin);
  return `${origin}/#s=${Buffer.from(JSON.stringify(state)).toString('base64url')}`;
}

test.beforeEach(async ({ page }) => {
  await page.route('**/sw.js', route => route.abort());
  await page.route('**/tiles.openfreemap.org/**', route => route.abort());
  await page.route('**/photon.komoot.io/api/**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ features: [] }),
  }));
});

// Fare mode ranks by the spread printed on the card and the heat key follows
// the largest visible fare chip.
test('fare ranking follows the displayed spread and heat follows the largest fare', async () => {
  const { compareAreaRank, heatValue } = await model();
  const wide = { key: 'wide', fareGap: 20, maxFare: 25, slowest: 40, gap: 10 };
  const tight = { key: 'tight', fareGap: 2, maxFare: 14, slowest: 40, gap: 10 };
  // Ascending rank puts the smallest displayed spread ahead of the largest.
  expect(compareAreaRank(tight, wide, 'fare')).toBeLessThan(0);
  expect(compareAreaRank(wide, tight, 'fare')).toBeGreaterThan(0);
  expect(heatValue(wide, 'fare')).toBe(25);
  expect(heatValue(tight, 'fare')).toBe(14);
  // The tie-break is the largest fare chip, not the total fare.
  const sameSpread = { key: 'wide', fareGap: 20, maxFare: 25, slowest: 40, gap: 10, totalFare: 99 };
  expect(compareAreaRank(wide, sameSpread, 'fare')).toBe(0);
});

// Equal visible numbers keep their order regardless of station priority.
test('no hidden meeting-suitability tie-break reorders equally fair areas', async () => {
  const { compareAreaRank, areaRank } = await model();
  const left = { key: 'a', fitScore: 12, priority: 1, kind: 1 };
  const right = { key: 'a', fitScore: 12, priority: 3, kind: 4 };
  expect(compareAreaRank(left, right)).toBe(0);
  expect(areaRank(left)).toEqual(areaRank(right));
  expect(areaRank(left)).toEqual([12, 0, 0, 'a']);
});

// Fare mode may reorder cells but must keep the time-difference filter.
test('buildCells keeps the time fairness filter used by fare mode', async () => {
  const [{ buildCells }, { store }] = await loadSourceModules(['routing.js', 'store.js'], stubs);
  store.NODES = {
    names: ['A', 'B', 'C'], kind: [1, 1, 1],
    lat: [22.30, 22.31, 22.32], lon: [114.10, 114.11, 114.12], st: [],
  };
  store.surface = [0, 1, 2];
  store.POI = null;
  // B is far slower than A/C, so it must be excluded even in fare mode.
  const cells = buildCells([[10, 12, 10], [10, 42, 10]], 0.1, 90);
  expect(cells.map(cell => cell.label).sort()).toEqual(['A', 'C']);
});

// Unreachable starts and a missing common area report different errors.
test('unreachable starts and no common area use different error copy', async () => {
  const { noReachErrorKey } = await model();
  expect(noReachErrorKey('no-common-area')).toBe('error.noCommonArea');
  expect(noReachErrorKey('no-stop')).toBe('error.noReach');
  expect(en['error.noCommonArea']).not.toBe(en['error.noReach']);
  for (const [file, data] of catalogues()) {
    expect(data['error.noReach'], file).toBeTruthy();
    expect(data['error.noCommonArea'], file).toBeTruthy();
    expect(data['error.noCommonArea'], file).not.toBe(data['error.noReach']);
  }
  expect(en['error.noReach']).toBe('No start place reaches the network.');
  expect(en['error.noCommonArea']).toContain('90 minutes');
});

// Source lookup stays inside the access radius without a station-kind bonus.
test('source lookup stays inside the fixed access radius', async () => {
  const [{ nearestSources }, { store }, { ACCESS_RADIUS_M, MAX_ACCESS_NODES }] =
    await loadSourceModules(['routing.js', 'store.js', 'config.js'], stubs);
  expect(ACCESS_RADIUS_M).toBe(1200);
  store.NODES = {
    names: ['Central', 'Far away', 'Exit'], kind: [1, 1, 3],
    lat: [22.280, 22.600, 22.2801], lon: [114.150, 114.900, 114.1501], st: [],
  };
  const sources = nearestSources(22.280, 114.150, 60, [0, 1, 2]);
  // The nearby station and its exit are candidates; the distant stop is not.
  expect(sources.map(source => source.node)).not.toContain(1);
  expect(sources.map(source => source.node)).toContain(0);
  expect(sources.every(source => source.minutes <= 60)).toBe(true);
  expect(MAX_ACCESS_NODES).toBeGreaterThan(0);
});

// Fairness floors are the advertised gap minima, not a share of the trip.
test('time and fare fairness floors match the legend', async () => {
  const { GAP_FLOOR_STATION_MIN, GAP_FLOOR_STOP_MIN, FARE_GAP_FLOOR } =
    await Promise.all([model(), config()]).then(([m, c]) => ({ ...m, FARE_GAP_FLOOR: c.FARE_GAP_FLOOR }));
  expect(GAP_FLOOR_STATION_MIN).toBe(8);
  expect(GAP_FLOOR_STOP_MIN).toBe(5);
  expect(FARE_GAP_FLOOR).toBe(1);
  const { overFairnessBand } = await model();
  // A 6-minute gap at a station is inside the 8-minute floor even when 10% of
  // a 50-minute fastest trip is only 5 minutes.
  expect(overFairnessBand({ fastest: 50, gap: 6, kind: 1 }, 0.1)).toBe(false);
  expect(overFairnessBand({ fastest: 50, gap: 9, kind: 1 }, 0.1)).toBe(true);
});

// Recenter fits the selected route without moving the start inputs.
test('recenter fits fair areas only', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  await page.locator('#go').click();
  await expect.poll(() => page.locator('.result-row').count()).toBeGreaterThan(0);
  await page.locator('.result-row').first().click();
  await expect.poll(() => page.locator('path.route-line').count()).toBeGreaterThan(0);
  const starts = await page.locator('.start-input').evaluateAll(els => els.map(el => el.value));
  const width = await page.evaluate(() => window.innerWidth);
  const routeBoxes = () => page.locator('path.route-line').evaluateAll(els => els.map(el => {
    const box = el.getBoundingClientRect();
    return { top: box.top, bottom: box.bottom, left: box.left, right: box.right };
  }));
  const visible = async () => {
    const map = await page.locator('#map').boundingBox();
    return (await routeBoxes()).every(box =>
      box.top >= map.y - 8 && box.bottom <= map.y + map.height + 8
      && box.left >= -8 && box.right <= width + 8);
  };
  await expect.poll(visible).toBe(true);
  await page.locator('.map-recenter-control .map-recenter').click();
  await expect.poll(visible).toBe(true);
  expect(await page.locator('.start-input').evaluateAll(els => els.map(el => el.value))).toEqual(starts);
  await expect(page.locator('.legend .recenter-key')).toHaveText(en['map.recenterKey']);
});

// Persisted and shared walk minutes snap to 5-minute steps at the boundaries.
test('walk tolerance is snapped to 5-minute steps at the outer boundaries', async ({ page }) => {
  const { snapWalkMinutes } = await model();
  expect([-7, 0, 17, 59, 63].map(snapWalkMinutes)).toEqual([0, 0, 15, 60, 60]);
  await page.goto('/');
  const origins = await page.evaluate(async () => {
    const nodes = await (await fetch('data/nodes.json')).json();
    return ['Tsuen Wan', 'North Point'].map(name => {
      const node = nodes.names.findIndex((value, i) => value === name && nodes.kind[i] === 1);
      return { kind: 'node', node, label: nodes.names[node], lat: nodes.lat[node], lon: nodes.lon[node] };
    });
  });
  for (const [raw, snapped] of [[-7, 0], [63, 60]]) {
    const state = {
      v: 1,
      people: origins.map((origin, i) => ({ id: `p${i + 1}`, name: ['A', 'B'][i], origin, walkMinutes: raw })),
      settings: { modes: ['rail', 'bus'], fairness: 'time', tolerance: 3.05, includeHeadway: true },
      locale: 'en',
      selected: { kind: 'result', index: 0 },
    };
    await page.goto(await shareUrl(page, state));
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
    for (const slider of await page.locator('[data-walk]').all()) {
      await expect(slider).toHaveAttribute('step', '5');
      await expect(slider).toHaveValue(String(snapped));
    }
    await expect.poll(() => page.evaluate(() => localStorage.getItem('hkfair.v2.people')))
      .toContain(`"walkMinutes":${snapped}`);
  }
});

// The no-fit message matches the modes that are actually enabled.
test('no-fit message follows the enabled modes', async () => {
  const { noFitErrorKey } = await model();
  expect(noFitErrorKey(['rail', 'bus'])).toBe('results.noFitTolerance');
  expect(noFitErrorKey(['rail'])).toBe('results.noFitMtr');
  expect(noFitErrorKey(['bus'])).toBe('results.noFitBus');
  expect(noFitErrorKey([])).toBe('error.noMode');
  expect(en['results.noFitTolerance']).toBe('No areas fit this tolerance. Increase it.');
  for (const [file, data] of catalogues()) {
    expect(data['results.noFitTolerance'], file).toBeTruthy();
    expect(data['results.noFitTolerance'], file).not.toMatch(/another mode|enable/i);
  }
});

// Source ranking uses walk minutes alone, never node kind.
test('source ranking uses walk minutes only', async () => {
  const { sourceRankMinutes } = await model();
  expect(sourceRankMinutes(12.4)).toBe(12.4);
  expect(sourceRankMinutes(-3)).toBe(-3);
  expect(sourceRankMinutes(undefined)).toBe(0);
  const [{ nearestSources }, { store }] = await loadSourceModules(['routing.js', 'store.js'], stubs);
  store.NODES = {
    names: ['Station', 'Exit', 'Bus'], kind: [1, 3, 4],
    lat: [22.28, 22.28005, 22.281], lon: [114.15, 114.1501, 114.152], st: [],
  };
  const sources = nearestSources(22.28, 114.15, 60, [0, 1, 2]);
  expect(sources[0].node).toBe(0);
  expect(sources[0].minutes).toBeLessThan(sources[sources.length - 1].minutes);
});

// The process summary must not overstate that every bus fare is estimated:
// published snapshot fares are shown as exact values.
test('process summary does not call every bus fare an estimate', () => {
  const summary = en['legal.summaryProcess'].toLowerCase();
  expect(summary.includes('all bus fares are estimates')).toBe(false);
  expect(summary.includes('bus fares are estimates.')).toBe(false);
});

// The count must disclose the actual sort key, not an obsolete fairness claim.
test('results header does not claim a fairest-first ordering', () => {
  expect(en['results.header'].toLowerCase().includes('fairest first')).toBe(false);
});
