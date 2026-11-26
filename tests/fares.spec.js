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

test('bundled MTR fares are the official station-pair values', () => {
  const fares = JSON.parse(readFileSync('static/data/mtr-fares.json', 'utf8'));
  const nodes = JSON.parse(readFileSync('static/data/nodes.json', 'utf8'));
  const station = name => nodes.names.findIndex((value, i) => value === name && nodes.kind[i] === 1);
  const pair = (from, to) => fares.fares[`${station(from)}|${station(to)}`];

  expect(fares.source.field).toBe('OCT_ADT_FARE');
  expect(Object.keys(fares.fares).length).toBeGreaterThan(8800);
  expect(pair('Kowloon Bay', 'Kowloon Tong')).toBe(7.4);
  expect(pair('Kowloon Bay', 'Lok Ma Chau')).toBe(46.6);
  expect(pair('Chai Wan', 'Lok Ma Chau')).toBe(54.4);
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
  await expect(page.locator('#steps')).toContainText('HK$46.6');
  await expect(page.locator('#steps')).toContainText('HK$54.4');
  await expect(page.locator('#steps')).not.toContainText('HK$20.5');
});
