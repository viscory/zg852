const { test, expect } = require('@playwright/test');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { loadSourceModule, loadSourceModules } = require('./source-modules');

const root = join(__dirname, '..');
const json = path => JSON.parse(readFileSync(join(root, 'static', 'data', path), 'utf8'));
// User-facing copy is owned by the i18n catalogues, so assert against the
// English source rather than pinning a literal phrase that copy edits change.
const en = JSON.parse(readFileSync(join(root, 'static', 'i18n', 'en.json'), 'utf8'));

// Browser-only modules imported but never called by the pure functions under
// test are stubbed so the real ESM source can be imported in Node.
const STUBS = {
  'engine.js': 'export const rerender=()=>{};',
  'state.js': 'export const save=()=>{};',
};

test.use({ serviceWorkers: 'block' });

async function shareUrl(page, state) {
  const origin = await page.evaluate(() => location.origin);
  return `${origin}/#s=${Buffer.from(JSON.stringify(state)).toString('base64url')}`;
}

async function nodeOrigins(page, names) {
  return page.evaluate(async wanted => {
    const nodes = await (await fetch('data/nodes.json')).json();
    return wanted.map(name => {
      const node = nodes.names.findIndex((value, i) => value === name && nodes.kind[i] === 1);
      return { kind: 'node', node, label: nodes.names[node], lat: nodes.lat[node], lon: nodes.lon[node] };
    });
  }, names);
}

test.beforeEach(async ({ page }) => {
  await page.route('**/sw.js', route => route.abort());
  await page.route('**/tiles.openfreemap.org/**', route => route.abort());
  await page.route('**/photon.komoot.io/api/**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ features: [] }),
  }));
});

// Finding 2: the pin walk check and the cell walk check must use the same raw
// tolerance value, with no rounding that lets an over-limit pin slip through.
test('walk tolerance uses one raw comparison in cells and pins', async ({ page }) => {
  const [routing] = await loadSourceModules(['routing.js', 'store.js'], STUBS);
  const { walkBudget } = routing;
  // walkBudget is the limit shared by the cell filter and the pin check. It
  // snaps to 5-minute steps but never rounds a walk up to fit under the limit.
  expect(walkBudget({ walkMinutes: 20 })).toBe(20);
  expect(walkBudget({ walkMinutes: 20.4 })).toBe(20);

  // A walk of ~20.4 minutes past a 20-minute limit must be rejected at a pin.
  await page.goto('/');
  const state = await page.evaluate(async () => {
    const nodes = await (await fetch('data/nodes.json')).json();
    const node = nodes.names.findIndex((value, i) => value === 'Lo Wu' && nodes.kind[i] === 1);
    const origin = { kind: 'node', node, label: nodes.names[node], lat: nodes.lat[node], lon: nodes.lon[node] };
    return {
      v: 1,
      people: [origin, { ...origin }].map((place, i) => ({ id: `p${i + 1}`, name: ['A', 'B'][i], origin: place, walkMinutes: 20 })),
      settings: { modes: ['rail'], fairness: 'time', tolerance: 3.05, includeHeadway: true },
      locale: 'en',
      // ~1.3 km north of Lo Wu: over 20 walking minutes at the app's speed.
      selected: { kind: 'point', lat: nodes.lat[node] + 1300 / 111320, lon: nodes.lon[node] },
    };
  });
  await page.goto(await shareUrl(page, state));
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  await expect(page.locator('#pointNotice')).toBeVisible();
  await expect(page.locator('#pointNoticeText')).toHaveText(en['error.pointWalkLimit']);
  await expect(page.locator('.point-pin')).toHaveCount(0);
});

// Finding 4: a coordinate origin must keep several distinct nearby stations,
// not collapse to the single nearest exit before Dijkstra runs.
test('origins pool distinct nearby stations instead of one exit', async () => {
  const [{ sourcesFor }, { store }] = await loadSourceModules(['routing.js', 'store.js'], STUBS);
  store.settings = { modes: ['rail', 'bus'] };
  store.NODES = {
    names: ['Central', 'Central · Exit (A)', 'Kowloon', 'Bus stop'],
    kind: [1, 3, 1, 4],
    lat: [22.280, 22.2801, 22.282, 22.279],
    lon: [114.150, 114.1501, 114.152, 114.149],
    st: [],
  };
  store.surface = [0, 1, 2, 3];
  const result = sourcesFor({ kind: 'coords', lat: 22.280, lon: 114.150 }, 60);
  expect(result.reason).toBe('ready');
  const nodes = result.sources.map(source => source.node);
  // The same station's exit collapses into its representative, while other
  // stations and the bus stop stay in the pool.
  expect(nodes).toContain(0);
  expect(nodes).not.toContain(1);
  expect(nodes).toContain(2);
  expect(nodes).toContain(3);
  // No station-kind bonus: the pool is ordered by the displayed walk minutes.
  const minutes = result.sources.map(source => source.minutes);
  expect(minutes).toEqual([...minutes].sort((a, b) => a - b));
  const { sourceRankMinutes } = await loadSourceModule('model.js');
  expect(result.sources.every(source => sourceRankMinutes(source.minutes) === source.minutes)).toBe(true);
});

test('a coordinate origin can still search after source pooling', async ({ page }) => {
  await page.goto('/');
  const origin = await page.evaluate(async () => {
    const nodes = await (await fetch('data/nodes.json')).json();
    const node = nodes.names.findIndex((value, i) => value === 'Mong Kok' && nodes.kind[i] === 1);
    return { kind: 'coords', label: 'Near Mong Kok', lat: nodes.lat[node] + 0.0002, lon: nodes.lon[node] + 0.0002 };
  });
  const state = {
    v: 1,
    people: [
      { id: 'p1', name: 'A', origin: origin, walkMinutes: 20 },
      { id: 'p2', name: 'B', origin: origin, walkMinutes: 20 },
    ],
    settings: { modes: ['rail'], tolerance: 3.05, includeHeadway: true },
    locale: 'en',
    selected: { kind: 'result', index: 0 },
  };
  await page.goto(await shareUrl(page, state));
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  await expect.poll(() => page.locator('.result-row').count()).toBeGreaterThan(0);
});

// Finding 6: long bus routes must use official Transport Department full fares,
// not a distance band that stops at the published band cap.
test('bundled route fares replace the capped bus bands', async () => {
  const fares = json('route-fares.json');
  const network = json('network.json');
  const [routing, { store }, config] = await loadSourceModules(['routing.js', 'store.js', 'config.js'], STUBS);
  store.ROUTE_FARES = fares;

  expect(fares.source.field).toContain('FULL_FARE');
  expect(Object.keys(fares.fares).length).toBeGreaterThan(2000);
  const bands = config.BUS_FARE_BANDS;
  const cap = bands[bands.length - 1][1];
  expect(bands[0][1]).toBeLessThan(cap);
  expect(cap).toBeGreaterThan(0);
  for (const name of ['A47X', 'NA47']) {
    const index = network.lines.findIndex(line => line.l === name);
    expect(index).toBeGreaterThanOrEqual(0);
    const value = routing.scheduledRouteFare({ lineIndex: index });
    expect(typeof value).toBe('number');
    expect(value).toBeGreaterThan(cap);
  }
});

// Finding 7: fare ranking uses the displayed fare spread, with visible fare
// and time values plus the disclosed interest preference as tie-breaks.
test('fare ranking sorts by the fare spread shown on the card', async () => {
  const { compareAreaRank, areaRank, heatValue } = await loadSourceModule('model.js');
  const { FARE_GAP_FLOOR } = await loadSourceModule('config.js');
  const wide = { key: 'wide', fareGap: 20, maxFare: 25, slowest: 40, gap: 10 };
  const tight = { key: 'tight', fareGap: 2, maxFare: 14, slowest: 40, gap: 10 };
  // Ascending rank puts the smallest displayed spread ahead of the largest.
  expect(compareAreaRank(tight, wide, 'fare')).toBeLessThan(0);
  expect(compareAreaRank(wide, tight, 'fare')).toBeGreaterThan(0);
  expect(heatValue(wide, 'fare')).toBe(25);
  expect(areaRank(wide, 'fare')).toEqual([20, 25, 40, 10, 'wide']);
  // Undisclosed presentation data cannot reorder two equally fair areas.
  expect(compareAreaRank(wide, { ...wide, totalFare: 99, meetingSuitability: 9 }, 'fare')).toBe(0);
  expect(FARE_GAP_FLOOR).toBeGreaterThan(0);
});

// Finding 10: stale AEL fallbacks are gone, AEL uses the bundled matrix, light
// rail has its own fare chart, and missing fares are visibly flagged.
test('fares come from current bundled tables and unknown values are flagged', async () => {
  const [faresApi, routing, { store }] = await loadSourceModules(['fares.js', 'routing.js', 'store.js'], STUBS);
  const config = await loadSourceModule('config.js');
  const mtr = json('mtr-fares.json');
  const nodes = json('nodes.json');
  const network = json('network.json');
  const index = name => nodes.names.findIndex((value, i) => value === name && nodes.kind[i] === 1);
  store.MTR_FARES = mtr;
  store.ROUTE_FARES = json('route-fares.json');

  expect('AEL_FARES' in config).toBe(false);
  // Airport Express values come from the bundled matrix, in both directions.
  for (const [from, to] of [['Airport', 'Hong Kong'], ['Airport', 'Kowloon'], ['Airport', 'Tsing Yi']]) {
    const expected = mtr.aelFares[faresApi.fareKey(mtr.nodeStation[String(index(from))], mtr.nodeStation[String(index(to))])];
    expect(expected).toBeGreaterThan(0);
    expect(faresApi.aelFareForNodes(index(from), index(to))).toBe(expected);
    expect(faresApi.aelFareForNodes(index(to), index(from))).toBe(expected);
  }
  // Light rail uses the published stop-count chart.
  for (const stops of [3, 6, 9]) {
    const expected = config.LIGHT_RAIL_FARES.find(([limit]) => stops <= limit)[1];
    expect(faresApi.lightRailFare(stops)).toBe(expected);
  }
  // Certainty follows provenance, not the travel mode.
  expect(faresApi.isEstimatedFare({ mode: 'bus' }, null)).toBe(true);
  expect(faresApi.isEstimatedFare({ mode: 'bus' }, 12.3)).toBe(false);
  expect(faresApi.isEstimatedFare({ mode: 'rail' }, null)).toBe(true);
  expect(faresApi.isEstimatedFare({ mode: 'rail' }, 7.4)).toBe(false);

  const route = {
    legs: [
      {
        mode: 'rail', fromNode: index('Central'), toNode: index('Kowloon Tong'),
        coords: [[22.28, 114.15], [22.31, 114.17]], stopCount: 0,
      },
      {
        mode: 'bus', lineIndex: network.lines.findIndex(line => line.l === 'A47X'),
        coords: [[22.28, 114.15], [22.32, 114.19]], stopCount: 0,
      },
    ],
  };
  routing.routeFares(route);
  for (const leg of route.legs) {
    expect(['mtr-matrix', 'band', 'td-snapshot']).toContain(leg.fareSource);
    expect(leg.fareEstimated).toBe(leg.fareSource === 'band');
  }
  expect(route.legs[1].fareSource).toBe('td-snapshot');
  expect(route.legs[1].fare).toBe(routing.scheduledRouteFare(route.legs[1]));
  expect(route.legs[1].fareEstimated).toBe(false);
});

// The Light Rail chart counts boarding and alighting stops. describe() stores
// stopCount as the ride edges after boarding, so N edges mean N+1 stops: the
// single leg's boarding stop must be added exactly once, not zero or twice.
test('light rail fare counts the boarding stop once per leg', async () => {
  const [routing, config] = await loadSourceModules(['routing.js', 'config.js'], STUBS);
  const rideEdges = 2;
  const leg = {
    mode: 'lightRail', fromNode: 0, toNode: 2,
    coords: [[22.40, 114.00], [22.41, 114.01]],
    stopCount: rideEdges,
  };
  const route = { legs: [leg] };
  const fares = routing.routeFares(route);
  const expected = config.LIGHT_RAIL_FARES.find(([limit]) => rideEdges + 1 <= limit)[1];
  expect(fares.lightRail).toBe(expected);
  expect(fares.total).toBe(expected);
  expect(fares.estimated).toBe(false);
  expect(leg.fare).toBe(expected);
  expect(leg.fareSource).toBe('lr-chart');
  expect(leg.fareEstimated).toBe(false);
});

test('Airport Express result uses the official bundled fare', async ({ page }) => {
  await page.goto('/');
  const [airport, hongKong] = await nodeOrigins(page, ['Airport', 'Hong Kong']);
  const state = {
    v: 1,
    people: [
      { id: 'p1', name: 'A', origin: airport, walkMinutes: 20 },
      { id: 'p2', name: 'B', origin: hongKong, walkMinutes: 20 },
    ],
    settings: { modes: ['rail'], fairness: 'time', tolerance: 3.05, includeHeadway: true },
    locale: 'en',
    selected: { kind: 'point', lat: hongKong.lat, lon: hongKong.lon },
  };
  await page.goto(await shareUrl(page, state));
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  await expect.poll(() => page.locator('.result-row').count()).toBeGreaterThan(0);

  await page.locator('#betaBadge').click();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#exportDiagnostics').click();
  const download = await downloadPromise;
  const dump = JSON.parse(readFileSync(await download.path(), 'utf8'));
  const legs = dump.selectedArea.routes.flatMap(route => route.legs);
  const ael = legs.filter(leg => String(leg.line).startsWith('MTR AEL'));
  expect(ael.length).toBeGreaterThan(0);

  // Derive certainty from the bundled AEL matrix and the app's exported fare
  // policy, not from a hard-coded allowlist of official amounts.
  const { fareKey, isEstimatedFare } = await loadSourceModule('fares.js');
  const mtr = json('mtr-fares.json');
  const officialFor = leg => {
    const from = mtr.nodeStation?.[leg.fromNode];
    const to = mtr.nodeStation?.[leg.toNode];
    if (from === undefined || to === undefined) return null;
    return mtr.aelFares[fareKey(Number(from), Number(to))] ?? null;
  };
  const published = new Set(Object.values(mtr.aelFares));
  for (const leg of ael) {
    // Airport/AsiaWorld-Expo pairs are official; city-to-city AEL pairs are not
    // published in the bundled matrix and must be visibly flagged as estimates.
    const official = officialFor(leg);
    expect(leg.fareEstimated).toBe(isEstimatedFare(leg, official));
    if (official !== null) expect(leg.fare).toBe(official);
    else expect(published.has(leg.fare)).toBe(false);
  }
  expect(ael.some(leg => !leg.fareEstimated && published.has(leg.fare))).toBe(true);
  expect(ael.some(leg => leg.fareEstimated)).toBe(true);
});

test('light-rail-only mode keeps real light-rail stops as candidate origins', async () => {
  const [routing, { store }] = await loadSourceModules(['routing.js', 'store.js'], STUBS);
  const nodes = json('nodes.json'), network = json('network.json');
  const lightRailNode = network.lines.find(line => line.c === 3).s[0];
  store.NODES = nodes;
  store.settings = { modes: ['lightRail'] };
  expect(routing.nodeCompatible(nodes.kind[lightRailNode])).toBe(true);
  expect(routing.sourceNodeIndices()).toContain(lightRailNode);
  expect(routing.sourcesFor({ kind: 'node', node: lightRailNode }, 90)).toEqual({ sources: [{ node: lightRailNode, minutes: 0 }], reason: 'ready' });
  // The same kind-4 stop is still excluded in MTR-only mode.
  store.settings.modes = ['rail'];
  expect(routing.nodeCompatible(nodes.kind[lightRailNode])).toBe(false);
});

test('an all-ones vector preference survives a versioned round trip', async () => {
  const [vectors, config] = await loadSourceModules(['vectors.js', 'config.js'], STUBS);
  const ones = Object.fromEntries(config.VECTOR_KEYS.map(key => [key, 1]));
  const versioned = { ...ones, [vectors.VECTOR_SCHEMA_VERSION_KEY]: vectors.VECTOR_SCHEMA_VERSION };
  expect(vectors.migrateVectors(versioned)).toEqual(versioned);
  // Unversioned all-ones still selects the documented legacy reset.
  expect(vectors.migrateVectors(ones)).toEqual(vectors.defaultVectors());
  expect(vectors.normalizeVectors(ones)[vectors.VECTOR_SCHEMA_VERSION_KEY]).toBe(vectors.VECTOR_SCHEMA_VERSION);
});
