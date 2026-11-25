const { test, expect } = require('@playwright/test');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');
const source = path => readFileSync(join(root, 'src', 'js', path), 'utf8');
const json = path => JSON.parse(readFileSync(join(root, 'static', 'data', path), 'utf8'));

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
test('walk tolerance uses one raw comparison in cells and pins', () => {
  const map = source('map.js');
  const engine = source('engine.js');
  expect(map).toMatch(/walk\s*>\s*walkLimits\[person\]\s*\+\s*1e-9/);
  expect(map).not.toMatch(/Math\.round\(walk\)\s*>\s*walkLimits/);
  expect(engine).toMatch(/walk<=limit\?walk:grid\[idx\]/);
});

// Finding 4: a coordinate origin must keep several distinct nearby stations,
// not collapse to the single nearest exit before Dijkstra runs.
test('origins pool distinct nearby stations instead of one exit', () => {
  const routing = source('routing.js');
  expect(routing).not.toMatch(/nearestSources\([^)]*\)\.slice\(0,1\)/);
  expect(routing).toMatch(/function sourceGroup\(/);
  expect(routing).toMatch(/const groups=new Map\(\)/);
  expect(routing).toMatch(/sourcePenalty\(idx\)/);
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
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  await expect.poll(() => page.locator('.result-row').count()).toBeGreaterThan(0);
});

// Finding 6: long bus routes must use official Transport Department full fares,
// not a distance band that stops at HK$17.7.
test('bundled route fares replace the capped bus bands', () => {
  const fares = json('route-fares.json');
  const network = json('network.json');
  const routing = source('routing.js');
  const config = source('config.js');

  expect(fares.source.field).toContain('FULL_FARE');
  expect(Object.keys(fares.fares).length).toBeGreaterThan(2000);
  expect(Math.max(...Object.values(fares.fares))).toBeGreaterThan(40);

  const lineIndex = name => network.lines.findIndex(line => line.l === name);
  expect(fares.fares[String(lineIndex('A47X'))]).toBe(29);
  expect(fares.fares[String(lineIndex('NA47'))]).toBe(44.5);

  expect(routing).toMatch(/function scheduledRouteFare\(/);
  expect(routing).toMatch(/scheduledRouteFare\(leg\)/);
  expect(config).toMatch(/BUS_FARE_BANDS=\[\[4,5\.5\]/);
});

// Finding 7: fare ranking must use the total paid first, with relative spread as
// the tie-break, and the filter must use a typical fare rather than the minimum.
test('fare ranking sorts by total then relative spread', () => {
  const engine = source('engine.js');
  expect(engine).toMatch(/totalFare=Math\.round\(fares\.reduce\(/);
  expect(engine).toMatch(/fareSpread=Math\.round\(\(fareGap\/Math\.max\(meanFare,1\)\)/);
  expect(engine).toMatch(/cached\.meanFare\*fareLimit,FARE_GAP_FLOOR/);
  expect(engine).toMatch(/\(a\.cell\.totalFare-b\.cell\.totalFare\)\|\|\(a\.cell\.fareSpread-b\.cell\.fareSpread\)/);
  expect(engine).not.toMatch(/fareScore=Math\.round\(\(maxFare\+fareGap\)/);
});

// Finding 10: stale AEL fallbacks are gone, AEL uses the bundled matrix, light
// rail has its own fare chart, and missing fares are visibly flagged.
test('fares come from current bundled tables and unknown values are flagged', () => {
  const config = source('config.js');
  const routing = source('routing.js');
  const fares = source('fares.js');
  const mtr = json('mtr-fares.json');
  const stations = json('nodes.json');
  const index = name => stations.names.findIndex((value, i) => value === name && stations.kind[i] === 1);

  expect(config).not.toMatch(/AEL_FARES/);
  expect(config).toMatch(/LIGHT_RAIL_FARES=\[\[3,5\.1\]/);
  expect(fares).toMatch(/export function lightRailFare\(/);
  expect(routing).toMatch(/lrStops\+lrLegs\.length\+1/);
  expect(routing).not.toMatch(/return 64\.5/);
  expect(routing).toMatch(/aelFareForNodes\(leg\.fromNode,leg\.toNode\)/);
  expect(routing).toMatch(/mark\(\[leg\],official===null\)/);
  expect(routing).toMatch(/export function fareMarkup/);

  const pair = (a, b) => mtr.aelFares[`${index(a)}|${index(b)}`] ?? mtr.aelFares[`${index(b)}|${index(a)}`];
  expect(pair('Airport', 'Hong Kong')).toBe(120);
  expect(pair('Airport', 'Kowloon')).toBe(105);
  expect(pair('Airport', 'Tsing Yi')).toBe(73);
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
  await page.reload();
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
  for (const leg of ael) {
    // Airport/AsiaWorld-Expo pairs are official; city-to-city AEL pairs are not
    // published in the bundled matrix and must be visibly flagged as estimates.
    const official = [6.5, 73, 105, 120].includes(leg.fare);
    expect(leg.fareEstimated).toBe(!official);
  }
  expect(ael.some(leg => leg.fare > 60)).toBe(true);
});
