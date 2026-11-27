const { test, expect } = require('@playwright/test');
const { readFileSync } = require('node:fs');

async function makeShareUrl(page, state) {
  return page.evaluate(value => {
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    let binary = '';
    bytes.forEach(byte => { binary += String.fromCharCode(byte); });
    const encoded = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `${location.origin}${location.pathname}#s=${encoded}`;
  }, state);
}

test.beforeEach(async ({ page }) => {
  await page.route('**/sw.js', route => route.abort());
  await page.route('**/tiles.openfreemap.org/**', route => route.abort());
  await page.route('**/basemaps.cartocdn.com/**', route => route.abort());
  await page.route('**/photon.komoot.io/api/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ features: [] }) }));
});

test('bundled MTR fares are internally consistent and sourced from OCT_ADT_FARE', () => {
  // Live station-pair amounts are verified by scripts/generate-mtr-fares.mjs at
  // build time, not by this spec; it only checks the snapshot's own integrity.
  const fares = JSON.parse(readFileSync('static/data/mtr-fares.json', 'utf8'));
  const nodes = JSON.parse(readFileSync('static/data/nodes.json', 'utf8'));
  const station = name => nodes.names.findIndex((value, i) => value === name && nodes.kind[i] === 1);
  const pair = (from, to) => fares.fares[`${station(from)}|${station(to)}`];

  expect(fares.source.field).toBe('OCT_ADT_FARE');
  expect(Object.keys(fares.fares).length).toBeGreaterThan(8800);

  // Data integrity, not pinned amounts: published values used in the matrix
  // are finite positive fares (a station to itself may be zero) and every
  // station pair is stored in both directions.
  const values = Object.values(fares.fares);
  expect(values.every(value => Number.isFinite(value) && value >= 0)).toBe(true);
  expect(Math.max(...values)).toBeGreaterThan(40);
  // Small documented sample of station names; expected values come from the
  // bundled matrix itself so a fare-table refresh needs no test edit.
  for (const [from, to] of [
    ['Kowloon Bay', 'Kowloon Tong'],
    ['Kowloon Bay', 'Lok Ma Chau'],
    ['Chai Wan', 'Lok Ma Chau'],
  ]) {
    const forward = pair(from, to), reverse = pair(to, from);
    expect(forward).toBe(reverse);
    expect(Number.isFinite(forward) && forward > 0).toBe(true);
  }
});

test('routes show looked-up MTR fares instead of distance-band estimates', async ({ page }) => {
  await page.goto('/');
  const state = await page.evaluate(async () => {
    const nodes = await (await fetch('data/nodes.json')).json();
    const index = name => nodes.names.findIndex((value, i) => value === name && nodes.kind[i] === 1);
    const origin = name => {
      const node = index(name);
      return { kind: 'node', node, label: nodes.names[node], lat: nodes.lat[node], lon: nodes.lon[node] };
    };
    const destination = index('Lok Ma Chau');
    return {
      v: 1,
      people: [
        { id: 'p1', name: 'Alex', origin: origin('Kowloon Bay'), walkMinutes: 20 },
        { id: 'p2', name: 'Sam', origin: origin('Chai Wan'), walkMinutes: 20 },
      ],
      settings: { modes: ['rail'], tolerance: 3.05, includeHeadway: true },
      locale: 'en',
      selected: { kind: 'point', lat: nodes.lat[destination], lon: nodes.lon[destination], node: destination },
    };
  });
  const url = await makeShareUrl(page, state);
  await page.goto(url);

  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  await expect.poll(() => page.locator('.result-row').count()).toBeGreaterThan(0);
  await expect(page.locator('#error')).toBeHidden();
  await expect(page.locator('#detailTitle')).toContainText('Lok Ma Chau');

  // Derive the expected chips from the bundled station-pair table rather than
  // pinning literal fares or an obsolete distance-band number in the test.
  const fares = JSON.parse(readFileSync('static/data/mtr-fares.json', 'utf8'));
  const nodes = JSON.parse(readFileSync('static/data/nodes.json', 'utf8'));
  const station = name => nodes.names.findIndex((value, i) => value === name && nodes.kind[i] === 1);
  const destination = station('Lok Ma Chau');
  const official = name => {
    const from = station(name);
    return fares.fares[`${from}|${destination}`] ?? fares.fares[`${destination}|${from}`];
  };
  const expected = ['Kowloon Bay', 'Chai Wan'].map(official);
  expect(expected.every(value => typeof value === 'number' && value > 0)).toBe(true);
  for (const value of expected) await expect(page.locator('#steps')).toContainText(`HK$${value}`);

  // Every rail fare chip must be a table lookup, never a band estimate.
  const shown = (await page.locator('#steps .ride-leg.route-rail .fare').allInnerTexts())
    .map(text => Number(text.replace(/[^0-9.]/g, '')));
  expect(shown.length).toBeGreaterThan(0);
  for (const value of shown) expect(expected).toContain(value);
});

test('bundled MTR fare tables have no zero fare between different stations', () => {
  const fares = JSON.parse(readFileSync('static/data/mtr-fares.json', 'utf8'));
  for (const table of [fares.fares, fares.aelFares || {}]) {
    const zeroCrossStation = Object.entries(table)
      .filter(([key, value]) => value === 0 && key.split('|')[0] !== key.split('|')[1])
      .map(([key]) => key);
    expect(zeroCrossStation, 'a trip between two different stations cannot cost zero').toEqual([]);
  }
});

test('every bundled route fare declares its source', () => {
  const fares = JSON.parse(readFileSync('static/data/route-fares.json', 'utf8'));
  const keys = Object.keys(fares.fares);
  expect(keys.length).toBeGreaterThan(0);
  for (const key of keys) {
    expect(Object.prototype.hasOwnProperty.call(fares.fareSources, key), `route fare ${key} should have a fareSources entry`).toBe(true);
    expect(fares.fareSources[key], `route fare ${key} should name a real source`).toBeTruthy();
  }
});

test('MTR CSV parser handles quoted fields offline and rejects missing headers', async () => {
  // Dynamic import of the generator module only loads its pure parser: the
  // network-reading script body runs solely on a direct invocation.
  const { pathToFileURL } = require('node:url');
  const { resolve } = require('node:path');
  const moduleUrl = pathToFileURL(resolve(__dirname, '..', 'scripts', 'generate-mtr-fares.mjs')).href;
  const { parseCsv } = await import(moduleUrl);

  expect(parseCsv('a,b\r\n1,"x,y"', ['a', 'b'])).toEqual([{ a: '1', b: 'x,y' }]);
  expect(parseCsv('a\n"say ""hi"""', ['a'])).toEqual([{ a: 'say "hi"' }]);
  expect(parseCsv('a,b\r\n1,\r\n', ['a', 'b'])).toEqual([{ a: '1', b: '' }]);
  expect(parseCsv('a,b\n"multi\nline",2', ['a', 'b'])).toEqual([{ a: 'multi\nline', b: '2' }]);
  expect(() => parseCsv('a,b\n1,2', ['a', 'c'])).toThrow(/missing required headers/);
});

test('route fare tie-break selects the higher fare and marks it distinctly', () => {
  // Python's pure helper is exercised directly; no .mdb feed or network is
  // needed because the optional parser import lives in rows(), not at module
  // load time.
  const { execFileSync } = require('node:child_process');
  const { resolve } = require('node:path');
  const script = resolve(__dirname, '..', 'scripts', 'generate-route-fares.py');
  const probe = `
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location('route_fares', sys.argv[1])
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
record = lambda fare: (fare, {'LOC_START_NAMEE': 'Central', 'LOC_END_NAMEE': 'Wan Chai'})
low, high = record(7.2), record(11.6)
cases = {'low-first': [low, high], 'high-first': [high, low], 'single': [low]}
print(json.dumps({name: mod.choose_fare(rows, 'central|wanchai', {'central', 'wanchai'}) for name, rows in cases.items()}))
`;
  const result = JSON.parse(execFileSync('python3', ['-c', probe, script], { encoding: 'utf8' }));
  for (const name of ['low-first', 'high-first']) {
    expect(result[name][1], `${name} should select the higher fare`).toBe(11.6);
    expect(result[name][2], `${name} should carry the tie-break marker`).toBe('td-full-fare-tiebreak');
  }
  expect(result.single[1]).toBe(7.2);
  expect(result.single[2]).toBe('td-full-fare');
});
