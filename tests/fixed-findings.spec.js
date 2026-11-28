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

test('fare heat scale follows displayed fares, not an unpublished Airport Express outlier', async ({ page }) => {
  const fares = JSON.parse(readFileSync(join(__dirname, '..', 'static/data/mtr-fares.json'), 'utf8'));
  let publishedMax = 0;
  for (const table of [fares.fares, fares.aelFares]) {
    for (const value of Object.values(table || {})) if (value > publishedMax) publishedMax = value;
  }
  const publishedTop = Math.ceil(publishedMax);

  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  const [kowloonBay, chaiWan] = await nodeOrigins(page, ['Kowloon Bay', 'Chai Wan']);
  const state = {
    v: 1,
    people: [
      { id: 'p1', name: 'A', origin: kowloonBay, walkMinutes: 20 },
      { id: 'p2', name: 'B', origin: chaiWan, walkMinutes: 20 },
    ],
    // Unlimited tolerances keep every time-feasible cell in the fare-ranked
    // pool, so the scale is driven by the cells the map actually paints.
    settings: { modes: ['rail', 'bus'], fairness: 'fare', tolerance: 3.05, fareTolerance: 3, includeHeadway: true },
    locale: 'en',
    selected: { kind: 'result', index: 0 },
  };
  await page.goto(await shareUrl(page, state));
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  await expect.poll(() => page.locator('path.heat-cell').count()).toBeGreaterThan(0);

  const cells = await page.locator('path.heat-cell').evaluateAll(elements => elements.map(element => ({
    fare: Number(element.getAttribute('data-max-fare') || 'NaN'),
    fill: element.getAttribute('fill'),
  })));
  expect(cells.length).toBeGreaterThan(0);
  const displayedTop = Math.ceil(Math.max(...cells.map(cell => cell.fare)));
  expect(displayedTop).toBeGreaterThan(0);
  // The published HK$120 Airport Express fare is not part of this scenario;
  // it must not push every ordinary HK$4-16 cell into one swatch.
  expect(displayedTop).toBeLessThan(publishedTop);

  await expect(page.locator('#legendFareScale')).toBeVisible();
  await expect(page.locator('#legendFareScale')).toHaveText(`HK$0–HK$${displayedTop}`);

  const { HEAT_COLORS } = await loadSourceModule('config.js');
  const { heatRatio } = await loadSourceModule('model.js');
  const fills = new Set();
  for (const cell of cells) {
    expect(Number.isFinite(cell.fare) && cell.fare >= 0).toBe(true);
    // Colours follow the shared logarithmic mapping on the displayed scale.
    const ratio = heatRatio(cell.fare, displayedTop);
    expect(cell.fill).toBe(HEAT_COLORS[Math.round(ratio * (HEAT_COLORS.length - 1))]);
    fills.add(cell.fill);
  }
  expect(fills.size).toBeGreaterThan(1);
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

test('a rejected pin blames the fare-mode walk limit', async ({ page }) => {
  await page.goto('/');
  const [loWu] = await nodeOrigins(page, ['Lo Wu']);
  const state = {
    v: 1,
    people: [
      { id: 'p1', name: 'A', origin: loWu },
      { id: 'p2', name: 'B', origin: loWu },
    ],
    settings: { modes: ['rail'], fairness: 'fare', tolerance: 3.05, fareTolerance: 3.05, includeHeadway: true },
    locale: 'en',
    // ~2.2 km north of Lo Wu: over the 30-minute Fare-mode walk limit.
    selected: { kind: 'point', lat: loWu.lat + 2200 / 111320, lon: loWu.lon },
  };
  const en = await (await page.request.get('i18n/en.json')).json();
  expect(en['error.pointWalkLimit']).toBe('That point needs a final walk longer than the 30-minute Fare-mode limit.');
  await page.goto(await shareUrl(page, state));
  await page.waitForFunction(() => !document.querySelector('#pointNotice').hidden, null, { timeout: 20000 });
  await expect(page.locator('#pointNoticeText')).toHaveText(en['error.pointWalkLimit']);
});

test('bus deep-link snapshot stays aligned with the network and records real fallbacks', () => {
  const root = join(__dirname, '..');
  const network = JSON.parse(readFileSync(join(root, 'static/data/network.json'), 'utf8'));
  const urls = JSON.parse(readFileSync(join(root, 'static/data/hkbus.json'), 'utf8'));
  const meta = JSON.parse(readFileSync(join(root, 'static/data/hkbus-meta.json'), 'utf8'));
  const search = 'https://hkbus.app/en/search';
  expect(urls.length).toBe(network.lines.length);
  expect(meta.length).toBe(network.lines.length);
  for (let i = 0; i < urls.length; i++) {
    if (meta[i].status === 'ok') expect(urls[i]).toMatch(/^https:\/\/hkbus\.app\/en\/route\//);
    else if (meta[i].status === 'not-a-bus-line') expect(urls[i]).toBeNull();
    else expect(urls[i]).toBe(search);
  }
  for (const entry of meta.filter(item => item.status === 'fallback')) {
    expect(['no-matching-key', 'page-404']).toContain(entry.reason);
  }
});
