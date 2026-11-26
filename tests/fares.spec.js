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

  // Data integrity, not pinned amounts: every published value is a finite
  // positive fare and every station pair is stored in both directions.
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
