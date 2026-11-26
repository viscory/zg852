const { test, expect } = require('@playwright/test');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { loadSourceModule } = require('./source-modules');

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
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ features: [] }),
  }));
});

test('metric copy follows the two fairness modes the UI exposes', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');

  const modes = await page.locator('#fairnessToggle [data-fairness]').evaluateAll(buttons =>
    buttons.map(button => ({ id: button.dataset.fairness, label: button.textContent.trim() })));
  expect(modes.map(mode => mode.id)).toEqual(['time', 'fare']);

  const help = (await page.locator('.vector-help').textContent()) || '';
  for (const mode of modes) expect(help.toLowerCase()).toContain(`${mode.label.toLowerCase()} mode`);
  expect(help).not.toContain('travel time only');

  const process = await (await page.request.get('process.html')).text();
  for (const mode of modes) expect(process).toContain(`${mode.label} mode`);
  expect(process).not.toContain('travel time only');
  expect(process).not.toContain('Only travel time is compared');
});

test('fare heat scale covers every published fare, including Airport Express', async ({ page }) => {
  const fares = JSON.parse(readFileSync(join(__dirname, '..', 'static/data/mtr-fares.json'), 'utf8'));
  let maxFare = 0;
  for (const table of [fares.fares, fares.aelFares]) {
    for (const value of Object.values(table || {})) if (value > maxFare) maxFare = value;
  }
  const expectedTop = Math.ceil(maxFare);
  expect(expectedTop).toBeGreaterThan(25);

  await page.goto('/');
  const [airport, hongKong] = await nodeOrigins(page, ['Airport', 'Hong Kong']);
  const state = {
    v: 1,
    people: [
      { id: 'p1', name: 'A', origin: airport, walkMinutes: 20 },
      { id: 'p2', name: 'B', origin: hongKong, walkMinutes: 20 },
    ],
    // Time tolerance is unlimited so every time-feasible AEL cell stays in the
    // fare-ranked pool; fare tolerance stays bounded so the heat map is shown.
    settings: { modes: ['rail', 'bus'], fairness: 'fare', tolerance: 3.05, fareTolerance: 3, includeHeadway: true },
    locale: 'en',
    selected: { kind: 'result', index: 0 },
  };
  await page.goto(await shareUrl(page, state));
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  await expect.poll(() => page.locator('path.heat-cell').count()).toBeGreaterThan(0);

  await expect(page.locator('#legendFareScale')).toBeVisible();
  await expect(page.locator('#legendFareScale')).toHaveText(`HK$0–HK$${expectedTop}`);

  const cells = await page.locator('path.heat-cell').evaluateAll(elements => elements.map(element => ({
    fare: Number(element.getAttribute('data-max-fare') || 'NaN'),
    fill: element.getAttribute('fill'),
  })));
  // Every cell must use the colour its fare earns on the published scale;
  // checking all cells proves the old HK$25 cap cannot flatten a high fare.
  const { HEAT_COLORS } = await loadSourceModule('config.js');
  const fills = new Set();
  let sawAboveOldCap = false;
  expect(cells.length).toBeGreaterThan(0);
  for (const cell of cells) {
    expect(Number.isFinite(cell.fare) && cell.fare >= 0).toBe(true);
    const ratio = Math.max(0, Math.min(1, cell.fare / expectedTop));
    expect(cell.fill).toBe(HEAT_COLORS[Math.round(ratio * (HEAT_COLORS.length - 1))]);
    fills.add(cell.fill);
    if (cell.fare > 25) sawAboveOldCap = true;
  }
  expect(fills.size).toBeGreaterThan(1);
  expect(sawAboveOldCap).toBe(true);
});

test('non-bus ride legs never claim to open a bus route', async ({ page }) => {
  await page.goto('/');
  const [siuHong, tinShuiWai] = await nodeOrigins(page, ['Siu Hong', 'Tin Shui Wai']);
  const state = {
    v: 1,
    people: [
      { id: 'p1', name: 'A', origin: siuHong, walkMinutes: 20 },
      { id: 'p2', name: 'B', origin: tinShuiWai, walkMinutes: 20 },
    ],
    settings: { modes: ['lightRail'], fairness: 'time', tolerance: 0.1, includeHeadway: true },
    locale: 'en',
    selected: { kind: 'result', index: 0 },
  };
  await page.goto(await shareUrl(page, state));
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  await expect.poll(() => page.locator('#steps .step').count()).toBe(2);
  // Prove the lightRail mode request was actually honoured before asserting
  // that no leg offers a bus link.
  await expect.poll(() => page.locator('#steps .ride-leg.route-lightRail').count()).toBeGreaterThan(0);
  for (const mode of ['rail', 'ferry', 'lightRail']) {
    expect(await page.locator(`#steps .ride-leg.route-${mode} .bus-link`).count()).toBe(0);
  }
  const links = await page.locator('#steps .bus-link').evaluateAll(elements => elements.map(element => element.href));
  for (const href of links) expect(href).toMatch(/^https:\/\/hkbus\.app\/en\/route\//);
});

test('mode exclusions explain that no compatible nearby stop was found', async ({ page }) => {
  await page.goto('/');
  const [central] = await nodeOrigins(page, ['Central']);
  const state = {
    v: 1,
    people: [
      {
        id: 'p1',
        name: 'A',
        origin: { kind: 'coords', source: 'photon', label: 'Cheung Chau Ferry Pier at San Hing Praya Street', lat: 22.20861, lon: 114.02848 },
        walkMinutes: 20,
      },
      { id: 'p2', name: 'B', origin: central, walkMinutes: 20 },
    ],
    settings: { modes: ['rail'], fairness: 'time', tolerance: 0.1, includeHeadway: true },
    locale: 'en',
    selected: { kind: 'result', index: 0 },
  };
  const en = await (await page.request.get('i18n/en.json')).json();
  expect(en['error.noNearbyMode']).toBe('No nearby stop is available for the selected travel modes.');
  await page.goto(await shareUrl(page, state));
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  await expect(page.locator('#error')).toHaveText('No nearby stop is available for the selected travel modes.');
});

test('a rejected pin blames the walk limit when that is what failed', async ({ page }) => {
  await page.goto('/');
  const [central, mongKok] = await nodeOrigins(page, ['Central', 'Mong Kok']);
  const state = {
    v: 1,
    people: [
      { id: 'p1', name: 'A', origin: central, walkMinutes: 0 },
      { id: 'p2', name: 'B', origin: mongKok, walkMinutes: 0 },
    ],
    settings: { modes: ['rail', 'bus'], fairness: 'time', tolerance: 3.05, includeHeadway: true },
    locale: 'en',
    // A few dozen metres from Central: transit reaches the area in time, but
    // the final walk is longer than a zero-minute walk tolerance allows.
    selected: { kind: 'point', lat: central.lat + 0.0003, lon: central.lon + 0.0003 },
  };
  const en = await (await page.request.get('i18n/en.json')).json();
  expect(en['error.pointWalkLimit']).toBe("That point needs a final walk longer than someone's walk tolerance.");
  await page.goto(await shareUrl(page, state));
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  await expect.poll(() => page.locator('.result-row').count()).toBeGreaterThan(0);
  await expect(page.locator('#pointNotice')).toBeVisible();
  await expect(page.locator('#pointNoticeText')).toHaveText("That point needs a final walk longer than someone's walk tolerance.");
});
