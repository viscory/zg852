const { test, expect } = require('@playwright/test');
const { sliderPosition } = require('./helpers');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { loadSourceModule } = require('./source-modules');

// en.json is the canonical key set; the expected count is derived from it.
const EN_CATALOGUE = JSON.parse(readFileSync(join(__dirname, '..', 'static', 'i18n', 'en.json'), 'utf8'));

function assertUsefulPolicy(policy) {
  expect(policy).toContain("script-src 'self'");
  expect(policy).not.toContain('unsafe-inline');
}

// Both the deployed origin and the local preview server send their real
// headers, so this always checks the live response rather than a config file.
function assertPolicy(response) {
  const header = response.headers()['content-security-policy'];
  expect(header, 'content-security-policy response header').toBeTruthy();
  assertUsefulPolicy(header);
  return header;
}

const PHOTON_FEATURES = [
  {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [114.171, 22.296] },
    properties: {
      name: 'Harbour City',
      housenumber: '3',
      street: 'Canton Road',
      city: 'Hong Kong',
      country: 'Hong Kong',
      osm_type: 'way',
      osm_id: '424242',
    },
  },
  {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [114.1715, 22.2965] },
    properties: {
      name: 'Harbour City',
      housenumber: '3',
      street: 'Canton Road',
      city: 'Hong Kong',
      country: 'Hong Kong',
      osm_type: 'way',
      osm_id: '424243',
    },
  },
];

const LOCALES = ['en', 'zh-Hant', 'zh-Hans', 'ja', 'ko', 'hi', 'ur', 'fil', 'id', 'fr', 'th', 'vi', 'ne', 'es', 'de'];

async function setRange(page, id, value) {
  const next = id === '#tolerance' ? await sliderPosition(Number(value)) : value;
  await page.locator(id).evaluate((el, n) => {
    el.value = n;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, next);
}

async function catalog(page, code) {
  return page.evaluate(async language => {
    const response = await fetch(`i18n/${language}.json`);
    if (!response.ok) throw new Error(`Missing ${language}`);
    return response.json();
  }, code);
}

async function clickableHeatCell(page) {
  const cells = page.locator('path.heat-cell');
  await expect(cells.first()).toBeVisible();
  let point = null;
  // Poll the real rendered cells until one is hit-testable; no fixed paint
  // delay and no invented viewport zone.
  await expect.poll(async () => {
    point = await cells.evaluateAll(elements => {
      for (const el of elements) {
        const box = el.getBoundingClientRect();
        if (box.width < 8 || box.height < 8) continue;
        const x = box.x + box.width / 2, y = box.y + box.height / 2;
        const top = document.elementFromPoint(x, y);
        if (top === el || top?.closest?.('.leaflet-interactive') === el) return { x, y };
      }
      return null;
    });
    return point !== null;
  }, { timeout: 5000 }).toBe(true);
  return point;
}

// A synthetic four-station rail graph that makes an interchange unavoidable:
// two origins start on separate lines and both must change at the hub onto the
// Use a real MTR-only scenario: Central → Kowloon Tong changes from the
// Tsuen Wan Line to the Kwun Tong Line at an interchange. No synthetic
// timetable is needed, so the test exercises the shipped graph.
async function openInterchangeScenario(page) {
  const state = await page.evaluate(async () => {
    const nodes = await (await fetch('data/nodes.json')).json();
    const origin = name => {
      const node = nodes.names.findIndex((value, i) => value === name && nodes.kind[i] === 1);
      return { kind: 'node', node, label: nodes.names[node], lat: nodes.lat[node], lon: nodes.lon[node] };
    };
    return {
      v: 1,
      people: ['Central', 'Kowloon Tong'].map((name, i) => ({
        id: `p${i + 1}`, name: ['A', 'B'][i], origin: origin(name), walkMinutes: 20,
      })),
      settings: { modes: ['rail'], fairness: 'time', tolerance: 3.05, includeHeadway: true },
      locale: 'en',
      selected: { kind: 'result', index: 0 },
    };
  });
  const origin = await page.evaluate(() => location.origin);
  await page.goto(`${origin}/#s=${Buffer.from(JSON.stringify(state)).toString('base64url')}`);
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  await page.locator('#go').click();
  await expect.poll(() => page.locator('.result-row').count()).toBeGreaterThan(0);
}

async function sharedState(page, url) {
  return page.evaluate(value => {
    const raw = value.split('#s=')[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = raw + '='.repeat((4 - raw.length % 4) % 4);
    const json = new TextDecoder().decode(Uint8Array.from(atob(padded), byte => byte.charCodeAt(0)));
    return JSON.parse(json);
  }, url);
}

test.beforeEach(async ({ page }) => {
  await page.route('**/sw.js', route => route.abort());
  await page.route('**/basemaps.cartocdn.com/**', route => route.abort());
  await page.route('**/tile.openstreetmap.org/**', route => route.abort());
  await page.route('**/tiles.openfreemap.org/**', route => route.abort());
  await page.route('**/photon.komoot.io/api/**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ features: PHOTON_FEATURES }),
  }));
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
});

test('map renders a keyless vector canvas with no API-key errors', async ({ page }) => {
  const blocked = [];
  const raster = [];
  page.on('request', req => {
    if (/cartocdn|fonts\.googleapis|unpkg\.com|jsdelivr/.test(req.url())) blocked.push(req.url());
    if (/tile\.openstreetmap\.org/.test(req.url())) raster.push(req.url());
  });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
  await expect(page.locator('body')).not.toContainText('API KEY');
  expect(blocked).toEqual([]);
  expect(raster).toEqual([]);
});

test('transport modes never let both MTR and bus be switched off', async ({ page }) => {
  const rail = page.locator('.chip[data-mode="rail"]');
  const bus = page.locator('.chip[data-mode="bus"]');
  await expect(rail).toHaveAttribute('aria-pressed', 'true');
  await expect(bus).toHaveAttribute('aria-pressed', 'true');

  await rail.click();
  await expect(rail).toHaveAttribute('aria-pressed', 'false');
  await expect(bus).toHaveAttribute('aria-pressed', 'true');
  await bus.click();
  await expect(bus).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#error')).toBeHidden();

  await rail.click();
  await expect(rail).toHaveAttribute('aria-pressed', 'true');
  await bus.click();
  await expect(bus).toHaveAttribute('aria-pressed', 'false');
  await rail.click();
  await expect(rail).toHaveAttribute('aria-pressed', 'true');
  await expect(bus).toHaveAttribute('aria-pressed', 'false');
});

test('brand copy and MTR-facing labels use the 就腳 name', async ({ page }) => {
  const en = await catalog(page, 'en');
  await expect(page.locator('.brand .logo')).toHaveText('ZG');
  await expect(page.locator('h1')).toHaveText('就腳 zau6 goek3');
  await expect(page.locator('h1')).toHaveText(en['app.title']);
  await expect(page.locator('body')).not.toContainText('Zak Geok');
  const jyutping = await page.locator('h1 .jyutping').evaluate(el => {
    const style = getComputedStyle(el);
    const parent = getComputedStyle(el.parentElement);
    return { fontStyle: style.fontStyle, color: style.color, parentColor: parent.color, fontSize: parseFloat(style.fontSize), parentSize: parseFloat(parent.fontSize) };
  });
  expect(jyutping.fontStyle).toBe('italic');
  expect(jyutping.color).not.toBe(jyutping.parentColor);
  expect(jyutping.fontSize).toBeLessThan(jyutping.parentSize);
  const sizes = await page.evaluate(() => {
    const input = document.querySelector('.name-input').getBoundingClientRect();
    const save = document.querySelector('.save-person').getBoundingClientRect();
    const pin = document.querySelector('.pin').getBoundingClientRect();
    return { input: input.height, save: save.height, saveWidth: save.width, pin: pin.height, pinWidth: pin.width };
  });
  expect(sizes.save).toBeCloseTo(sizes.input, 0);
  expect(sizes.saveWidth).toBeCloseTo(sizes.input, 0);
  expect(sizes.pin).toBeCloseTo(sizes.input, 0);
  expect(sizes.pinWidth).toBeCloseTo(sizes.input, 0);
  await expect(page.locator('.brand .sub')).toHaveText('Find a fair meeting point in Hong Kong');
  await expect(page.locator('.brand .sub')).toHaveText(en['app.subtitle']);
  await expect(page.locator('.brand .meaning')).toHaveCount(0);
  await expect(page.locator('.chip[data-mode="rail"]')).toHaveAttribute('aria-label', 'MTR');
  await expect(page.locator('.route-key [data-i18n="map.railKey"]')).toHaveText('MTR');
  await expect(page.locator('#tolerance')).toHaveAttribute('min', '1');
  await expect(page.locator('label[for="tolerance"]')).toHaveText('Target time difference');
  await expect(page.locator('.tolerance-row #exportDiagnostics')).toHaveCount(0);
  await expect(page.locator('.legal-links #exportDiagnostics')).toBeHidden();
  await expect(page.locator('#exportDiagnostics .icon-download')).toHaveCount(1);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', 'https://zg852.pages.dev/og-image.png?v=2');
});

test('robots, llms, sitemap and build headers expose the llms.txt endpoint', async ({ page }) => {
  const robots = await page.request.get('/robots.txt');
  expect(robots.ok()).toBeTruthy();
  expect(await robots.text()).toContain('/llms.txt');

  const llms = await page.request.get('/llms.txt');
  expect(llms.ok()).toBeTruthy();
  expect(await llms.text()).toContain('就腳');

  const sitemap = await page.request.get('/sitemap.xml');
  expect(sitemap.ok()).toBeTruthy();
  expect(await sitemap.text()).toContain('/llms.txt');

  const home = await page.request.get('/');
  assertPolicy(home);
  const llmsHeaders = await page.request.get('/llms.txt');
  const cache = llmsHeaders.headers()['cache-control'];
  expect(cache, 'llms.txt cache-control response header').toBeTruthy();
  expect(cache).toContain('max-age=3600');
});

test('production bundle avoids importmaps and CSP exceptions', async ({ page, browser }) => {
  assertPolicy(await page.request.get('/'));
  await expect(page.locator('script[type="importmap"]')).toHaveCount(0);
  await expect(page.locator('script[type="module"][src="/app.js"]')).toHaveCount(1);
  const requested = [];
  page.on('request', req => requested.push(req.url()));
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  expect(requested.some(url => url.includes('tiles.openfreemap.org/planet'))).toBe(true);
  // Query the delivered DOM, not bundle source text. A fresh context with JS
  // disabled keeps third-party runtime styling (e.g. MapLibre's canvas sizes)
  // out of the picture, so any inline script body or style attribute found
  // here is a genuine CSP exception in the built markup.
  const delivered = await browser.newContext({ javaScriptEnabled: false });
  try {
    const staticPage = await delivered.newPage();
    await staticPage.goto(new URL(page.url()).origin);
    await expect(staticPage.locator('script:not([src])')).toHaveCount(0);
    await expect(staticPage.locator('[style]')).toHaveCount(0);
  } finally {
    await delivered.close();
  }
});

test('clean basemap adds keyless place labels without raster tiles', async ({ page }) => {
  const requested = [];
  const raster = [];
  page.on('request', req => {
    requested.push(req.url());
    if (/tile\.openstreetmap\.org/.test(req.url())) raster.push(req.url());
  });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  expect(requested.some(url => url.includes('tiles.openfreemap.org/planet'))).toBe(true);
  // Glyph files are requested only when a locale needs non-basic glyphs.
  expect(raster).toEqual([]);
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
});

test('defaults load and a two-person search draws fair map areas', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  await expect(page.locator('.card')).toHaveCount(2);
  await expect(page.locator('.name-input').nth(0)).toHaveValue('Person A');
  await expect(page.locator('.name-input').nth(1)).toHaveValue('Person B');
  await expect(page.locator('.start-input').nth(0)).toHaveValue('Tsuen Wan');
  await expect(page.locator('.start-input').nth(1)).toHaveValue('North Point');
  await expect(page.locator('#detail')).toBeHidden();
  await expect(page.locator('path.heat-cell')).toHaveCount(0);
  await expect(page.locator('#resultsList')).toBeEmpty();
  await expect(page.locator('#resultState')).toBeVisible();
  await expect(page.locator('#nres')).toBeEmpty();
  await expect(page.locator('#saveSummary')).toHaveCount(0);

  await page.locator('#go').click();
  await expect.poll(() => page.locator('path.heat-cell').count()).toBeGreaterThan(0);
  await expect.poll(() => page.locator('.result-row').count()).toBeGreaterThan(0);
  // Searching reveals the detail face directly; no result click is needed.
  await expect(page.locator('.side-left .face[data-face="detail"]')).toBeVisible();
  await expect(page.locator('.result-row.selected')).toHaveCount(1);
  await expect(page.locator('.result-row').first().locator('.fare.total').first()).toContainText('Fare HK$');
  await expect(page.locator('.result-row').first()).not.toContainText('MTR HK$');
  await expect(page.locator('.result-row').first()).not.toContainText('Bus HK$');
  await expect(page.locator('#detail')).toBeAttached();
  await expect(page.locator('#detailTitle')).not.toBeEmpty();
  await expect(page.locator('#detailDistrict')).not.toBeEmpty();
  await expect(page.locator('#steps')).not.toContainText(/\b(route|results|map|people|mode|unit)\.[A-Za-z]/);
  await page.locator('.result-row').first().click();
  await expect(page.locator('.side-left .face[data-face="detail"]')).toBeVisible();
  await expect(page.locator('#detail')).toBeVisible();
  await expect(page.locator('#steps .step')).toHaveCount(2);
  await expect(page.locator('.step').first()).toContainText('Person A');
  await expect(page.locator('.step').first().locator('.fare.total')).toContainText('Fare HK$');
  await expect(page.locator('.step').first()).not.toContainText('MTR HK$');
  await expect(page.locator('.step').first()).not.toContainText('Bus HK$');
  await expect(page.locator('.ride-leg .leg-mode').first()).not.toBeEmpty();
  await expect(page.locator('.ride-leg .leg-mode').first()).not.toContainText(/MTR\s+[A-Z]{3}\b/);
  const legStops = await page.locator('.ride-leg .leg-stops').allInnerTexts();
  expect(legStops.length).toBeGreaterThan(0);
  for (const text of legStops) expect(text).toMatch(/\s→\s/);
  const arrows = await page.locator('.ride-leg .leg-arrow').allInnerTexts();
  expect(arrows.length).toBe(legStops.length);
  for (const text of arrows) expect(text).toBe('→');
  await expect(page.locator('.ride-leg .leg-arrow').first()).toHaveCSS('color', 'rgb(211, 47, 47)');
  await expect(page.locator('.ride-leg .leg-stops').first()).toHaveCSS('overflow-wrap', 'anywhere');
  await expect(page.locator('#steps')).not.toContainText('Get on:');
  await expect(page.locator('#steps')).not.toContainText('Get off:');
  await expect(page.locator('.ride-leg .leg-meta').first()).toContainText('min');
  await expect(page.locator('.ride-leg .leg-meta').first()).toContainText('Fare HK$');
  const minuteTexts = await page.locator('.result-times span, .leg-time').allInnerTexts();
  expect(minuteTexts.length).toBeGreaterThan(0);
  for (const text of minuteTexts) {
    expect(text).toMatch(/\b\d+\s+min\b/);
    expect(text).not.toMatch(/\d+\.\d+\s+min/);
  }
  // The default mixed-mode scenario can favour buses now that first boardings
  // no longer carry headway wait. The positive full-line-name assertion lives
  // in the MTR-only test below, where the fixture guarantees rail legs.
  await expect(page.locator('#steps .dot').first()).toHaveText('PA');
  await expect(page.locator('#steps .dot').nth(1)).toHaveText('PB');
  await expect.poll(() => page.locator('path.route-line.route-person-0').count()).toBeGreaterThan(0);
  await expect.poll(() => page.locator('path.route-line.route-person-1').count()).toBeGreaterThan(0);
  await expect(page.locator('body')).not.toContainText('Ranked places');
  await expect(page.locator('body')).not.toContainText('★');
  await expect(page.locator('body')).not.toContainText('—');
  expect(errors).toEqual([]);
});

test('empty-state search also reveals the route detail face', async ({ page }) => {
  await expect(page.locator('#go')).toBeVisible();
  await expect(page.locator('.side-left .face[data-face="detail"]')).toBeHidden();
  await page.locator('#go').click();
  await expect.poll(() => page.locator('.result-row').count()).toBeGreaterThan(0);
  await expect(page.locator('.side-left .face[data-face="detail"]')).toBeVisible();
  await expect(page.locator('#detail')).toBeVisible();
});

test('interchange waits are charged only after the first transit leg', async ({ page }) => {
  // The wait note is a headway feature, so this scenario needs the default on.
  await openInterchangeScenario(page);
  await expect(page.locator('#includeHeadway')).toBeChecked();

  // One `.step` is one person's route; ride legs inside it are in travel order.
  // Return the interchange notes attached to each ride leg of each route.
  const routeWaits = () => page.locator('#steps .step').evaluateAll(steps => steps.map(step => {
    const rides = [...step.querySelectorAll('.ride-leg')];
    return rides.map(ride => [...ride.querySelectorAll('.interchange-wait')].map(note => note.textContent.trim()));
  }));
  // The first boarding of every person's route is free of headway wait, and
  // every wait note belongs to a later ride leg.
  const routes = await routeWaits();
  expect(routes).toHaveLength(2);
  expect(routes.every(route => route.length === 0 || route[0].length === 0)).toBe(true);

  const notes = await page.locator('.ride-leg .interchange-wait').allInnerTexts();
  for (const note of notes) {
    expect(note).toMatch(/^Interchange wait\s+\d+\s+min$/);
    expect(note).not.toMatch(/\d+\.\d+\s+min/);
  }
  expect(await page.locator('.ride-leg .leg-meta .interchange-wait').count()).toBe(notes.length);
});

test('displayed route legs reconcile with the total when headway is shown', async ({ page }) => {
  // The synthetic interchange fixture guarantees a second ride leg with a
  // headway wait for each person, so every step can be checked directly.
  await openInterchangeScenario(page);
  await expect(page.locator('#includeHeadway')).toBeChecked();

  const steps = await page.locator('#steps .step').evaluateAll(elements => elements.map(step => {
    const values = [...step.querySelectorAll('.ride-text, .leg-time, .interchange-wait')]
      .map(el => Number((el.textContent.match(/\d+/) || [])[0]) || 0);
    const totalText = step.querySelector('.route-meta .muted')?.textContent || '';
    return {
      sum: values.reduce((a, b) => a + b, 0),
      total: Number((totalText.match(/\d+/) || [])[0]),
      hasWait: Boolean(step.querySelector('.interchange-wait')),
    };
  }));
  expect(steps).toHaveLength(2);
  for (const step of steps) expect(step.sum).toBe(step.total);
});

test('travel budget slider is gone', async ({ page }) => {
  await expect(page.locator('#budget')).toHaveCount(0);
  await expect(page.locator('#budgetval')).toHaveCount(0);
  await expect(page.locator('label[for="budget"]')).toHaveCount(0);
});

test('the search button sits at the top and the results list shows a bottom scroll shadow', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 700 });
  await expect(page.locator('#go')).toBeVisible();
  await expect(page.locator('.side-right .go:visible')).toHaveCount(1);
  const goBox = await page.locator('#go').boundingBox();
  expect(goBox).not.toBeNull();
  expect(goBox.height).toBeLessThan(45);
  await page.locator('#go').click();
  await expect.poll(() => page.locator('.result-row').count()).toBeGreaterThan(0);
  expect(parseFloat(await page.locator('#nres').evaluate(el => getComputedStyle(el).paddingInlineEnd))).toBeGreaterThan(0);

  const section = page.locator('.results-section');
  await expect.poll(() => section.evaluate(el => el.scrollHeight > el.clientHeight + 2)).toBe(true);
  await expect(section).toHaveClass(/scroll-bottom/);

  await section.evaluate(el => {
    el.scrollTop = el.scrollHeight;
    el.dispatchEvent(new Event('scroll'));
  });
  await expect(section).not.toHaveClass(/scroll-bottom/);

  await section.evaluate(el => {
    el.scrollTop = 0;
    el.dispatchEvent(new Event('scroll'));
  });
  await expect(section).toHaveClass(/scroll-bottom/);
});

test('right sidebar footer carries project links only', async ({ page }) => {
  const footer = page.locator('.side-right footer');
  await expect(footer).toBeVisible();
  await expect(footer).not.toContainText('Routing runs in this browser');
  await expect(footer).not.toContainText('Inspired by');
  for (const [key, label] of Object.entries({
    privacy: 'Privacy',
    terms: 'Terms',
    credits: 'Credits',
    process: 'Process',
  })) {
    const button = footer.locator(`[data-legal="${key}"]`);
    await expect(button).toBeVisible();
    await expect(button).toHaveText(label);
  }
});

test('ride paths follow GTFS shapes anchored to stop coordinates', async ({ page }) => {
  const report = await page.evaluate(async () => {
    const net = await (await fetch('data/network.json')).json();
    const nodes = await (await fetch('data/nodes.json')).json();
    const close = (point, index) => Array.isArray(point)
      && Number.isFinite(index)
      && Math.abs(point[0] - nodes.lat[index]) <= 1e-5
      && Math.abs(point[1] - nodes.lon[index]) <= 1e-5;
    let detailedSegments = 0;
    let anchoredLines = 0;
    for (const line of net.lines) {
      if (line.c !== 0 && line.c !== 1) continue;
      if (!Array.isArray(line.g)) continue;
      let anchored = false;
      for (let i = 0; i < line.g.length; i++) {
        const shape = line.g[i];
        if (!Array.isArray(shape) || shape.length <= 2) continue;
        detailedSegments += 1;
        if (close(shape[0], line.s[i]) && close(shape[shape.length - 1], line.s[i + 1])) anchored = true;
      }
      if (anchored) anchoredLines += 1;
    }
    return { detailedSegments, anchoredLines };
  });
  expect(report.detailedSegments).toBeGreaterThan(0);
  expect(report.anchoredLines).toBeGreaterThan(0);
});

test('rendered ride paths include shape geometry beyond a stop-to-stop chord', async ({ page }) => {
  const selectors = 'path.route-line.route-bus, path.route-line.route-rail';
  await page.locator('#go').click();
  await expect.poll(() => page.locator(selectors).count()).toBeGreaterThan(0);
  // Leaflet emits SVG paths as M/L commands; a straight one-stop chord has two pairs.
  await expect.poll(() => page.locator(selectors).evaluateAll(els => Math.max(0, ...els.map(el => {
    const numbers = (el.getAttribute('d') || '').match(/-?\d+(?:\.\d+)?/g) || [];
    return Math.floor(numbers.length / 2);
  })))).toBeGreaterThan(3);
});

test('leg fare chips reconcile with the step fare total', async ({ page }) => {
  await page.locator('#go').click();
  await expect.poll(() => page.locator('#steps .step').count()).toBeGreaterThan(0);
  const step = page.locator('#steps .step').first();
  await expect.poll(() => step.locator('.ride-leg .fare').count()).toBeGreaterThan(0);
  const amount = text => Number(text.replace(/[^0-9.]/g, ''));
  const legAmounts = (await step.locator('.ride-leg .fare').allInnerTexts()).map(amount).filter(Number.isFinite);
  expect(legAmounts.length).toBeGreaterThan(0);
  const total = amount(await step.locator('.fare.total').first().innerText());
  expect(Number.isFinite(total)).toBeTruthy();
  expect(Math.abs(legAmounts.reduce((sum, value) => sum + value, 0) - total)).toBeLessThanOrEqual(0.1);
});

test('selected map area shows district subtitles and segmented routes', async ({ page }) => {
  await page.locator('#go').click();
  await expect.poll(() => page.locator('path.heat-cell').count()).toBeGreaterThan(0);
  await expect(page.locator('#detailDistrict')).not.toBeEmpty();
  await expect(page.locator('.legend')).toBeVisible();
  await expect(page.locator('.legend .route-key')).toBeVisible();
  await expect(page.locator('.route-key-help')).toHaveText(EN_CATALOGUE['map.routeKeyHelp']);
  await expect(page.locator('.route-key .route-walk')).toBeVisible();
  await expect(page.locator('.route-key .route-rail')).toBeVisible();
  await expect(page.locator('.route-key .route-bus')).toBeVisible();
  await expect.poll(() => page.locator('.leaflet-route-pane path.route-line').count()).toBeGreaterThan(0);
  await expect.poll(() => page.locator('path.route-line').count()).toBeGreaterThan(0);
  await expect.poll(() => page.locator('path.route-line.route-walk').count()).toBeGreaterThan(0);
  await expect.poll(() => page.locator('path.route-line.route-bus').count()).toBeGreaterThan(0);
  await expect.poll(() => page.locator('#steps .walk-leg.route-walk').count()).toBeGreaterThan(0);
  await expect.poll(() => page.locator('#steps .ride-leg.route-bus').count()).toBeGreaterThan(0);
  const busLinks = await page.locator('#steps .ride-leg.route-bus .bus-link').evaluateAll(links => links.map(link => ({ href: link.href, text: link.textContent.trim(), target: link.target, rel: link.rel })));
  expect(busLinks.length).toBeGreaterThan(0);
  for (const link of busLinks) {
    expect(link.href).toMatch(/^https:\/\/hkbus\.app\/en\/route\//);
    expect(link.text).toMatch(/\d/);
    expect(link.target).toBe('_blank');
    expect(link.rel).toContain('noopener');
  }
});

test('clicking a red area selects that map area', async ({ page }) => {
  await page.locator('#go').click();
  const point = await clickableHeatCell(page);
  await page.mouse.click(point.x, point.y);
  await expect(page.locator('#detail')).toBeVisible();
  await expect(page.locator('#detailTitle')).not.toBeEmpty();
  await expect(page.locator('#steps .step')).toHaveCount(2);
  await expect.poll(() => page.locator('path.route-line').count()).toBeGreaterThan(0);
});

test('duplicate places collapse and suggestions are keyboard navigable', async ({ page }) => {
  await page.locator('#add').click();
  const third = page.locator('.card').nth(2);
  const input = third.locator('.start-input');
  await input.fill('3 Canton Road');

  await expect(third.locator('.suggestion').first()).toBeVisible();
  await expect(third.locator('.suggestion')).toHaveCount(1);
  await expect(third.locator('.suggestion .avatar')).toBeVisible();
  await expect(third.locator('.suggestion')).toContainText('2 stops');
  await expect(third.locator('.suggestion .district')).not.toBeEmpty();

  const activeId = await input.getAttribute('aria-controls');
  await input.press('ArrowDown');
  await expect(input).toHaveAttribute('aria-activedescendant', `${activeId}-option-0`);
  await expect(third.locator('.suggestion').first()).toHaveClass(/active/);
  await input.press('Enter');
  await expect(input).toHaveValue('Harbour City, 3 Canton Road, Hong Kong');
  await expect(third.locator('.hint')).toHaveCount(0);
  await expect(third.locator('.suggestions')).toBeHidden();
});

test('saved people library can add and delete profiles', async ({ page }) => {
  await page.locator('.card').first().locator('.save-person').click();
  await page.locator('#library').click();
  await expect(page.locator('#peopleDialog')).toBeVisible();
  await expect(page.locator('.directory-row')).toHaveCount(2);
  await page.locator('#directorySearch').fill('Person A');
  await expect(page.locator('.directory-row')).toHaveCount(1);
  await page.locator('#directorySearch').fill('');
  await page.locator('#libraryClose').click();

  await page.locator('#add').click();
  await page.locator('#library').click();
  const personB = page.locator('.directory-row').filter({ hasText: 'Person B' });
  await personB.locator('[data-action="add"]').click();
  await expect(page.locator('#peopleDialog')).toBeHidden();
  await expect(page.locator('.card')).toHaveCount(4);
  await expect(page.locator('.name-input').nth(2)).toHaveValue('Person C');
  await expect(page.locator('.name-input').nth(3)).toHaveValue('Person B');
  await expect(page.locator('.start-input').nth(3)).toHaveValue('North Point');

  await page.locator('#library').click();
  const personA = page.locator('.directory-row').filter({ hasText: 'Person A' });
  await personA.locator('[data-action="delete"]').click();
  await expect(personA.locator('[data-action="delete"]')).toHaveAttribute('aria-label', 'Delete?');
  await expect(personA.locator('[data-action="delete"]')).toHaveAttribute('data-tooltip', 'Delete?');
  await personA.locator('[data-action="delete"]').click();
  await expect(page.locator('.directory-row')).toHaveCount(1);
});

test('recenter never changes an origin', async ({ page }) => {
  await expect(page.locator('.card .centre')).toHaveCount(0);

  const before = await page.locator('.start-input').first().inputValue();
  await page.locator('.map-recenter-control .map-recenter').click();
  await expect(page.locator('.start-input').first()).toHaveValue(before);
  await expect(page.locator('.hint')).toHaveCount(0);
});

test('scenario removal works down to one and card controls are icon-only', async ({ page }) => {
  const card = page.locator('.card').first();
  await expect(card.locator('.remove')).toBeVisible();
  await expect(card.locator('.remove')).toHaveAttribute('title', 'Remove person A');
  await expect(card.locator('.remove')).toHaveAttribute('data-tooltip', 'Remove person A');
  await expect(card.locator('.drag-handle')).toHaveCount(0);
  await expect(card.locator('.centre')).toHaveCount(0);

  for (const selector of ['.save-person', '.remove', '.pin']) {
    await expect(card.locator(selector)).toHaveText('');
  }

  await card.locator('.remove').click();
  await expect(page.locator('.card')).toHaveCount(1);
  await expect(page.locator('.remove')).toBeHidden();
  await page.locator('#go').click();
  await expect(page.locator('#error')).toHaveText('Add at least two people with a start place.');
});

test('people and routes share the leftbar, parameters and results stay right, and the map fills the middle', async ({ page }) => {
  await expect(page.locator('.layout > .side')).toHaveCount(2);
  await expect(page.locator('aside.side-right')).toHaveAttribute('aria-label', 'Parameters');
  await expect(page.locator('.options-title').first()).toHaveText('Parameters');
  await expect(page.locator('.side-left .card')).toHaveCount(2);
  await expect(page.locator('.side-left #add')).toBeVisible();
  await expect(page.locator('.side-left #detail')).toBeAttached();
  await expect(page.locator('.side-left .face[data-face="detail"]')).toBeHidden();
  await expect(page.locator('.side-right #resultsList')).toBeAttached();
  await expect(page.locator('.side-right #resultState')).toBeVisible();
  await expect(page.locator('.side-right #nres')).toBeAttached();
  await expect(page.locator('#optionsPanel')).toBeVisible();
  await expect(page.locator('#optionsPanel')).toHaveCSS('position', 'sticky');
  await expect(page.locator('.rightbar-footer')).toHaveCSS('position', 'sticky');
  await expect(page.locator('.side-right #go')).toBeVisible();
  await expect(page.locator('.side-right #tolerance')).toBeVisible();
  await expect(page.locator('#swapFace')).toBeVisible();
  await page.locator('#swapFace').click();
  await expect(page.locator('.side-left .face[data-face="detail"]')).toBeVisible();
  await expect(page.locator('.side-left #add')).toBeHidden();
  await page.locator('#swapFace').click();
  await expect(page.locator('.side-left #add')).toBeVisible();
  await expect(page.locator('#budget')).toHaveCount(0);
  await expect(page.locator('#shareStatus')).toBeAttached();
  await expect(page.locator('.side-right #reset')).toHaveCount(0);
  await expect(headerLibrary(page)).toBeVisible();
  await expect(page.locator('.main #map')).toBeVisible();
});

function headerLibrary(page) {
  return page.locator('header #library');
}

test('person avatars use initials and cycle distinct colors', async ({ page }) => {
  const avatars = page.locator('.card .avatar');
  await expect(avatars).toHaveCount(2);
  expect(await avatars.allTextContents()).toEqual(['PA', 'PB']);
  const colors = await avatars.evaluateAll(els => els.map(el => getComputedStyle(el).color));
  expect(colors[0]).not.toBe(colors[1]);

  await page.locator('#add').click();
  await expect(avatars).toHaveCount(3);
  const third = await avatars.nth(2).evaluate(el => getComputedStyle(el).color);
  expect(new Set([...colors, third]).size).toBe(3);
});

test('pin mode shows the active person and can be cancelled', async ({ page }) => {
  const before = await page.locator('.start-input').first().inputValue();
  await page.locator('.card').first().locator('.pin').click();
  await expect(page.locator('#map')).toHaveClass(/pinning/);
  await expect(page.locator('#pinBanner')).toBeVisible();
  await expect(page.locator('#pinAvatar')).toHaveText('PA');
  await expect(page.locator('#pinLabel')).toHaveText('Pinning Person A');
  await expect(page.locator('.legend .pin-key')).toContainText('Pin: tap pin, then tap map');

  await page.locator('#cancelPin').click();
  await expect(page.locator('#map')).not.toHaveClass(/pinning/);
  await expect(page.locator('#pinBanner')).toBeHidden();
  await expect(page.locator('.start-input').first()).toHaveValue(before);

  await page.locator('.card').nth(1).locator('.pin').click();
  await expect(page.locator('#pinAvatar')).toHaveText('PB');
  await page.keyboard.press('Escape');
  await expect(page.locator('#pinBanner')).toBeHidden();
});

test('search results draw a discrete red heatmap instead of a gradient', async ({ page }) => {
  await page.locator('#go').click();
  await expect.poll(() => page.locator('path.heat-cell').count()).toBeGreaterThan(0);
  const fills = await page.locator('path.heat-cell').evaluateAll(els => [...new Set(els.map(el => el.getAttribute('fill')))]);
  const { HEAT_COLORS } = await loadSourceModule('config.js');
  expect(fills.length).toBeGreaterThan(0);
  expect(fills.every(fill => HEAT_COLORS.includes(fill))).toBe(true);
  await expect(page.locator('.legend .swatch.h1')).toBeVisible();
  await expect(page.locator('.legend .swatch.h6')).toBeVisible();
});

test('named people, Photon addresses and tolerance cloud work', async ({ page }) => {
  await page.locator('.card').nth(0).locator('.name-input').fill('Alex');
  await page.locator('.card').nth(1).locator('.name-input').fill('Sam');
  await page.locator('#add').click();

  const third = page.locator('.card').nth(2);
  await third.locator('.name-input').fill('Riley');
  await third.locator('.start-input').fill('3 Canton Road');
  await third.locator('.suggestion').first().click();
  await expect(third.locator('.start-input')).toHaveValue('Harbour City, 3 Canton Road, Hong Kong');
  await expect(third.locator('.hint')).toHaveCount(0);
  await expect(page.locator('#count')).toHaveText('3');

  await setRange(page, '#tolerance', '0.2');
  await expect(page.locator('#tolval')).toHaveText('20%');

  await page.locator('#go').click();
  await expect.poll(() => page.locator('path.heat-cell').count()).toBeGreaterThan(0);
  await expect(page.locator('#steps .step')).toHaveCount(3);
  await expect(page.locator('.step').first()).toContainText('Alex');
  await expect(page.locator('.step').nth(2)).toContainText('Riley');
  await expect.poll(() => page.locator('.leaflet-overlay-pane path').count()).toBeGreaterThan(0);
  await expect(page.locator('#goLabel')).toHaveText('Find fair areas');
});

test('tolerance runs from 5% to 300%, then opens free point picking', async ({ page }) => {
  await expect(page.locator('#tolerance')).toHaveAttribute('min', '1');
  await expect(page.locator('#tolerance')).toHaveAttribute('max', '201');
  await expect(page.locator('#tolerance')).toHaveAttribute('step', '1');
  await setRange(page, '#tolerance', '3');
  await expect(page.locator('#tolval')).toHaveText('300%');
  await expect(page.locator('#unboundedHint')).toBeHidden();

  await setRange(page, '#tolerance', '3.05');
  await expect(page.locator('#tolval')).toHaveText('Unlimited');
  await page.locator('#go').click();
  await expect.poll(() => page.locator('.result-row').count()).toBeGreaterThan(0);
  await expect(page.locator('#unboundedHint')).toBeVisible();
  await expect.poll(() => page.locator('path.heat-cell').count()).toBeGreaterThan(0);
  await expect(page.locator('path.heat-cell').first()).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('path.heat-cell[tabindex]')).toHaveCount(0);

  const mapBox = await page.locator('#map').boundingBox();
  expect(mapBox).not.toBeNull();
  const viewBefore = await page.locator('.leaflet-map-pane').evaluate(el => el.style.transform);
  await page.mouse.click(mapBox.x + mapBox.width * 0.52, mapBox.y + mapBox.height * 0.55);
  await expect(page.locator('#pointBanner')).toBeVisible();
  await expect.poll(() => page.locator('.leaflet-map-pane').evaluate(el => el.style.transform)).toBe(viewBefore);
  await expect(page.locator('#detailTitle')).toHaveText('Pinned point');
  await expect(page.locator('#steps')).toContainText('Pinned point');
  await expect(page.locator('#steps .route-meta')).toHaveCount(2);
  await expect(page.locator('#steps .route-meta').first()).toContainText('min');
  await expect(page.locator('#steps .route-meta').first()).toContainText('HK$');
  const splitWalks = await page.locator('#steps .step').evaluateAll(steps => steps.filter(step => !step.querySelector('.ride-leg') && step.querySelectorAll('.walk-leg').length > 1).length);
  expect(splitWalks).toBe(0);
  await expect(page.locator('#interestRatings')).toBeVisible();
  await expect(page.locator('.fit-row')).toHaveCount(6);
  await expect(page.locator('#interestRatings')).not.toContainText('/100');

  const pinBox = await page.locator('.point-pin').first().boundingBox();
  expect(pinBox).not.toBeNull();
  await page.mouse.move(pinBox.x + pinBox.width / 2, pinBox.y + pinBox.height / 2);
  await expect(page.locator('#mapTooltip')).toBeVisible({ timeout: 2500 });
  await expect(page.locator('#mapTooltip')).toContainText('Pinned point');
  await expect(page.locator('#mapTooltip .tooltip-vector')).toHaveCount(6);
  await expect(page.locator('#mapTooltip .tooltip-fill')).toHaveCount(6);
  const pinWidths = await page.locator('#mapTooltip .tooltip-fill').evaluateAll(fills => fills.map(fill => fill.style.width));
  expect(pinWidths).toHaveLength(6);
  expect(pinWidths.every(width => /^\d+%$/.test(width))).toBe(true);
  const pinFills = await page.locator('#mapTooltip .tooltip-fill').evaluateAll(fills => fills.map(fill => {
    const box = fill.getBoundingClientRect();
    return { width: box.width, height: box.height };
  }));
  expect(pinFills.every(({ height }) => height > 0)).toBe(true);
  expect(pinFills.some(({ width }) => width > 0)).toBe(true);

  await page.locator('#clearPoint').click();
  await expect(page.locator('#pointBanner')).toBeHidden();
  await expect(page.locator('#detailTitle')).not.toHaveText('Pinned point');

  await setRange(page, '#tolerance', '3');
  await expect(page.locator('#tolval')).toHaveText('300%');
  await expect(page.locator('#unboundedHint')).toBeHidden();
  await expect.poll(() => page.locator('path.heat-cell').count()).toBeGreaterThan(0);
});

test('diagnostics dump downloads a timestamped JSON file and copies it', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.locator('#go').click();
  await expect.poll(() => page.locator('.result-row').count()).toBeGreaterThan(0);
  await page.locator('#betaBadge').click();
  await expect(page.locator('#exportDiagnostics')).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.locator('#exportDiagnostics').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^zg852-diagnostics-\d{8}-\d{4}\.json$/);

  const file = JSON.parse(readFileSync(await download.path(), 'utf8'));
  expect(file.schema).toBe(1);
  expect(file.settings.fairness).toBe('time');
  expect(file.settings.modes).toEqual(['rail', 'bus']);
  expect(file.settings.tolerance).toBeGreaterThan(0);
  expect(file.settings.fareTolerance).toBeGreaterThan(0);
  expect(file.settings.travelBudgetMinutes).toBe(90);
  expect(file.settings.includeHeadway).toBe(true);
  expect(file.settings.toleranceLimited).toBe(true);
  expect(file.settings.unbounded).toBe(false);
  expect(file.people).toHaveLength(2);
  expect(file.areas.length).toBeGreaterThan(0);
  expect(file.areas[0].routes.length).toBe(2);
  expect(file.areas[0].routes[0].legs.length).toBeGreaterThan(0);

  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(JSON.parse(clipboard).schema).toBe(1);
  await expect(page.locator('#diagStatus')).toHaveText('Diagnostics downloaded and copied');
});

test('settings, people, library and locale persist, and clearing storage restores defaults', async ({ page }) => {
  await page.locator('.card').nth(0).locator('.name-input').fill('Alex');
  await page.locator('.chip[data-mode="bus"]').click();
  await setRange(page, '#tolerance', '0.25');
  await page.locator('.card').first().locator('.save-person').click();
  await page.locator('#locale').selectOption('zh-Hant');
  await expect.poll(() => page.locator('html').getAttribute('lang')).toBe('zh-Hant');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('hkfair.v2.locale'))).toBe('zh-Hant');

  const stored = await page.evaluate(() => ({
    people: localStorage.getItem('hkfair.v2.people'),
    settings: localStorage.getItem('hkfair.v2.settings'),
    directory: localStorage.getItem('hkfair.v2.directory'),
    locale: localStorage.getItem('hkfair.v2.locale'),
  }));
  expect(stored.people).toContain('Alex');
  expect(stored.settings).toContain('"tolerance":0.25');
  expect(stored.directory).toContain('Alex');
  expect(stored.locale).toBe('zh-Hant');

  await page.reload();
  await expect.poll(() => page.locator('html').getAttribute('lang')).toBe('zh-Hant');
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  await expect(page.locator('.name-input').first()).toHaveValue('Alex');
  await expect(page.locator('.chip[data-mode="rail"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.chip[data-mode="bus"]')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#tolval')).toHaveText('25%');

  await page.locator('#locale').selectOption('en');
  await expect.poll(() => page.locator('html').getAttribute('lang')).toBe('en');

  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  await expect(page.locator('.card')).toHaveCount(2);
  await expect(page.locator('.name-input').first()).toHaveValue('Person A');
  await expect(page.locator('#tolval')).toHaveText('10%');
});

test('locale switching translates static text and enables RTL layout', async ({ page }) => {
  const traditional = await catalog(page, 'zh-Hant');
  const urdu = await catalog(page, 'ur');
  await page.locator('#go').click();
  await expect.poll(() => page.locator('path.heat-cell').count()).toBeGreaterThan(0);
  const englishDistrict = await page.locator('#detailDistrict').textContent();

  await page.locator('#locale').selectOption('zh-Hant');
  await expect.poll(() => page.locator('html').getAttribute('lang')).toBe('zh-Hant');
  await expect(page.locator('h1')).toHaveText(traditional['app.title']);
  await expect(page.locator('#goLabel')).toHaveText(traditional['options.search']);
  await expect(page.locator('.legend-head')).toHaveText(traditional['map.legend']);
  await expect(page.locator('#map')).toHaveAttribute('aria-label', traditional['map.aria']);
  await expect.poll(() => page.locator('#detailDistrict').textContent()).not.toBe(englishDistrict);
  await expect(page.locator('#detailSub')).toContainText('差距');
  await expect(page.locator('#detailSub')).toContainText('最長');
  // The search itself revealed the detail face; swap back to people for #add.
  await expect(page.locator('.side-left .face[data-face="detail"]')).toBeVisible();
  await page.locator('#swapFace').click();
  await expect(page.locator('.side-left .face[data-face="people"]')).toBeVisible();
  await page.locator('#add').click();
  await page.locator('#locale').selectOption('ur');
  await expect.poll(() => page.locator('html').getAttribute('dir')).toBe('rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ur');
  await expect(page.locator('#goLabel')).toHaveText(urdu['options.search']);
  await page.locator('#go').click();
  await expect(page.locator('#error')).toHaveText(urdu['error.missingOrigins']);
});

test('all catalogues keep the same keys', async ({ page }) => {
  const catalogues = await Promise.all(LOCALES.map(code => catalog(page, code)));
  const expected = Object.keys(EN_CATALOGUE).sort();
  expect(expected.length).toBeGreaterThan(0);
  expect(Object.keys(catalogues[0]).sort()).toEqual(expected);
  // These keys are deliberately absent; this only proves they stayed out of
  // the served catalogues, and says nothing about any live UI copy.
  for (const key of ['app.meaning', 'people.focusLabel', 'people.focusTime', 'people.focusCost']) {
    expect(Object.keys(catalogues[0])).not.toContain(key);
  }
  // Spot-check served English values against en.json itself, so a reviewed
  // copy change cannot break this test by pinning the old literal.
  for (const key of ['app.title', 'app.subtitle', 'options.rail', 'mode.rail', 'map.railKey', 'options.tolerance', 'results.fareTotal', 'results.noFitMtr']) {
    expect(catalogues[0][key]).toBe(EN_CATALOGUE[key]);
  }
  for (const entries of catalogues) {
    expect(Object.keys(entries).sort()).toEqual(expected);
  }
});

test('rejects an unset origin with an inline error and no map output', async ({ page }) => {
  await page.locator('#add').click();
  await page.locator('#go').click();
  await expect(page.locator('#error')).toBeVisible();
  await expect(page.locator('#error')).toHaveText('Choose a start place for every person.');
  await expect(page.locator('#detail')).toBeHidden();
  await expect(page.locator('path.heat-cell')).toHaveCount(0);
  await expect(page.locator('#resultsList')).toBeEmpty();
});

test('tight tolerance across spread-out starts produces no map areas', async ({ page }) => {
  await page.locator('#add').click();
  await page.locator('#add').click();
  await pickStation(page, 0, 'Lo Wu');
  await pickStation(page, 1, 'Airport');
  await pickStation(page, 2, 'Tuen Mun');
  await pickStation(page, 3, 'Tsuen Wan');
  await setRange(page, '#tolerance', '0.05');
  await page.locator('#go').click();
  await expect(page.locator('path.heat-cell')).toHaveCount(0);
  await expect(page.locator('#detail')).toBeHidden();
  await expect(page.locator('#error')).toHaveText('No areas fit this tolerance. Increase it.');
});

test('MTR-only search still finds fair areas with default settings', async ({ page }) => {
  await expect(page.locator('.card')).toHaveCount(2);
  await expect(page.locator('.chip[data-mode="rail"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#tolval')).toHaveText('10%');
  await page.locator('.chip[data-mode="bus"]').click();
  await expect(page.locator('.chip[data-mode="bus"]')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#go').click();
  await expect.poll(() => page.locator('path.heat-cell').count()).toBeGreaterThan(0);
  await expect.poll(() => page.locator('.result-row').count()).toBeGreaterThan(0);
  await expect(page.locator('#error')).toBeHidden();
  await expect(page.locator('.result-row').first().locator('.fare.total').first()).toContainText('Fare HK$');
  // Rail-only mode guarantees rail legs, so this is a positive assertion that
  // the chip carries the operator's full line name rather than a three-letter code.
  await page.locator('.result-row').first().click();
  await expect.poll(() => page.locator('#steps .ride-leg.route-rail').count()).toBeGreaterThan(0);
  const railChips = await page.locator('#steps .ride-leg.route-rail .leg-mode').allInnerTexts();
  expect(railChips.length).toBeGreaterThan(0);
  for (const chip of railChips) {
    // The chip shows the operator's full line name, never a three-letter code.
    expect(chip).not.toMatch(/MTR\s+[A-Z]{3}\b/);
    expect(chip).toMatch(/Line|Express|Railway/);
  }
});

test('MTR-only no-fit message names the disabled mode', async ({ page }) => {
  await page.locator('#add').click();
  await page.locator('#add').click();
  await pickStation(page, 0, 'Lo Wu');
  await pickStation(page, 1, 'Airport');
  await pickStation(page, 2, 'Tuen Mun');
  await pickStation(page, 3, 'Tsuen Wan');
  await page.locator('.chip[data-mode="bus"]').click();
  await setRange(page, '#tolerance', '0.05');
  await page.locator('#go').click();
  await expect(page.locator('path.heat-cell')).toHaveCount(0);
  await expect(page.locator('#error')).toBeVisible();
  await expect(page.locator('#error')).toContainText('MTR');
});

test('map pin fallback saves a coordinate origin', async ({ page }) => {
  await page.locator('.card').nth(0).locator('.pin').click();
  await expect(page.locator('#map')).toHaveClass(/pinning/);
  await expect(page.locator('#pinBanner')).toBeVisible();
  await page.locator('#map').click({ position: { x: 320, y: 220 } });
  await expect(page.locator('#map')).not.toHaveClass(/pinning/);
  await expect(page.locator('#pinBanner')).toBeHidden();
  await expect(page.locator('.start-input').first()).toHaveValue(/^Pinned point /);
  await expect(page.locator('.hint')).toHaveCount(0);

  await page.locator('#go').click();
  await expect.poll(() => page.locator('path.heat-cell').count()).toBeGreaterThan(0);
  await expect(page.locator('#steps .step')).toHaveCount(2);
});

test('migrates v1 people and modes into v2 storage', async ({ page }) => {
  await page.evaluate(async () => {
    const nodes = await fetch('data/nodes.json').then(r => r.json());
    const find = name => nodes.names.findIndex((n, i) => n === name && nodes.kind[i] === 1);
    const a = find('Tsuen Wan');
    const b = find('North Point');
    localStorage.clear();
    localStorage.setItem('hkfair.v1.locations', JSON.stringify([
      { name: 'Tsuen Wan', lat: nodes.lat[a], lon: nodes.lon[a], i: a },
      { name: 'North Point', lat: nodes.lat[b], lon: nodes.lon[b], i: b },
    ]));
    localStorage.setItem('hkfair.v1.modes', JSON.stringify(['rail']));
    localStorage.setItem('hkfair.v1.weight', '2');
  });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  await expect(page.locator('.card')).toHaveCount(2);
  await expect(page.locator('.name-input').first()).toHaveValue('Person A');
  await expect(page.locator('.start-input').first()).toHaveValue('Tsuen Wan');
  await expect(page.locator('.chip[data-mode="bus"]')).toHaveAttribute('aria-pressed', 'false');
  const stored = await page.evaluate(() => ({
    people: localStorage.getItem('hkfair.v2.people'),
    settings: localStorage.getItem('hkfair.v2.settings'),
  }));
  expect(stored.people).toContain('Tsuen Wan');
  expect(stored.settings).toContain('"modes":["rail"]');
});

test('design system avoids banned decoration and labels every control', async ({ page }) => {
  await expect(page.locator('.locale')).toHaveAttribute('title', 'Language');
  await expect(page.locator('.locale')).toHaveAttribute('data-tooltip', 'Language');
  await expect(page.locator('.locale .icon-globe')).toBeVisible();
  await expect(page.locator('#locale')).toHaveAttribute('aria-label', 'Language');
  for (const selector of ['#add', '#library', '#go', '#share']) {
    await expect(page.locator(`${selector} .icon`)).toBeVisible();
    await expect(page.locator(selector)).toHaveAttribute('data-tooltip', /.+/);
    await expect(page.locator(selector)).toHaveAttribute('aria-label', /.+/);
  }
  await expect(page.locator('#reset')).toHaveCount(0);
  for (const mode of ['rail', 'bus']) {
    const chip = page.locator(`.chip[data-mode="${mode}"]`);
    await expect(chip.locator('.icon')).toBeVisible();
    await expect(chip).toHaveAttribute('data-tooltip', /.+/);
  }
  await expect(page.locator('#recenter')).toHaveCount(0);
  await expect(page.locator('.map-recenter-control .map-recenter')).toBeVisible();
  await expect(page.locator('.map-recenter-control .icon-scan')).toBeVisible();
  await expect(page.locator('.map-recenter-control .map-recenter')).toHaveAttribute('aria-label', 'Recenter map');
  await expect(page.locator('.leaflet-control-zoom')).toBeVisible();
  await expect(page.locator('.legend-head .icon-scan')).toBeVisible();
  await expect(page.locator('.legend')).toBeVisible();
  await expect(page.locator('.legend')).toHaveCSS('z-index', '900');
  await expect(page.locator('#betaBadge')).toBeVisible();
  await expect(page.locator('#betaVectors')).toHaveCount(0);
  await expect(page.locator('.beta-toggle')).toHaveCount(0);
  await expect(page.locator('#vectorSection')).toBeHidden();
  await expect(page.locator('#legendVectorKey')).toBeHidden();
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
  await page.locator('#library').click();
  const actionText = await page.locator('.directory-actions button').evaluateAll(els => els.map(el => el.textContent.trim()));
  expect(actionText.every(text => text === '')).toBe(true);
  const actions = page.locator('.directory-row').first().locator('.directory-actions button');
  for (const [index, className] of ['icon-add', 'icon-edit', 'icon-trash-2'].entries()) {
    await expect(actions.nth(index).locator(`.${className}`)).toBeVisible();
  }
  const masks = await actions.evaluateAll(buttons => buttons.map(button => getComputedStyle(button.querySelector('.icon')).maskImage));
  expect(masks.length).toBeGreaterThan(0);
  expect(masks.every(mask => mask && mask !== 'none')).toBe(true);
  const audit = await page.evaluate(() => {
    const scope = [...document.querySelectorAll('header *, .side *, .legend *, .overlay *, dialog *')];
    const style = el => getComputedStyle(el);
    return {
      gradients: scope.filter(el => style(el).backgroundImage !== 'none').map(el => el.tagName),
      blur: scope.filter(el => (style(el).backdropFilter || 'none') !== 'none').map(el => el.tagName),
      unlabelled: [...document.querySelectorAll('input,select')]
        .filter(input => !document.querySelector(`label[for="${input.id}"]`))
        .map(input => input.id),
      text: document.body.innerText,
      pulses: document.querySelectorAll('.pulse').length,
    };
  });

  expect(audit.gradients).toEqual([]);
  expect(audit.blur).toEqual([]);
  expect(audit.unlabelled).toEqual([]);
  expect(audit.pulses).toBe(0);
  expect(audit.text).not.toContain('★');
  expect(audit.text).not.toContain('—');
});

test('beta interest vectors default off and recompute the map with labelled preferences', async ({ page }) => {
  await expect(page.locator('#vectorSection')).toBeHidden();
  await expect(page.locator('#legendVectorKey')).toBeHidden();
  await expect(page.locator('#exportDiagnostics')).toBeHidden();
  await page.locator('#betaBadge').click();
  await expect(page.locator('#vectorSection')).toBeVisible();
  await expect.poll(() => page.locator('#go').evaluate(el => Math.round(el.getBoundingClientRect().height))).toBe(36);
  await expect(page.locator('#legendVectorKey')).toBeVisible();
  await expect(page.locator('#exportDiagnostics')).toBeVisible();
  for (const key of ['food', 'drinks', 'activities', 'culture', 'outdoors', 'shopping']) {
    await expect(page.locator(`#vec-${key}`)).toHaveValue('0');
    await expect(page.locator(`#vec-${key}-val`)).toHaveText('Off');
    await expect(page.locator(`.vector-row:has(#vec-${key}) .icon`)).toBeVisible();
  }
  await expect(page.locator('.vector-help')).toContainText('travel time');
  await page.locator('#go').click();
  await expect.poll(() => page.locator('path.heat-cell').count()).toBeGreaterThan(0);
  await expect(page.locator('#interestRatings')).toBeVisible();
  await expect(page.locator('#interestToggle')).toHaveText('Interest ratings');
  await page.locator('#interestToggle').click();
  await expect(page.locator('#interestToggle')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.fit-row')).toHaveCount(6);
  await expect(page.locator('#fitOverall')).toHaveCount(0);
  await expect(page.locator('.fit-value')).toHaveCount(0);
  await expect(page.locator('#interestRatings')).not.toContainText('/100');
  const rightbarWidths = await page.locator('#fitGrid .fit-fill').evaluateAll(fills => fills.map(fill => fill.style.width));
  expect(rightbarWidths).toHaveLength(6);
  expect(rightbarWidths.every(width => /^\d+%$/.test(width))).toBe(true);
  await expect(page.locator('#detailSub')).not.toContainText('preference');

  // The recompute is debounced and can finish between polls, so record the
  // button's live working state with a MutationObserver and poll the recording.
  await page.evaluate(() => {
    const go = document.getElementById('go');
    window.__workingLabels = [];
    const observer = new MutationObserver(() => window.__workingLabels.push(go.getAttribute('aria-label')));
    observer.observe(go, { attributes: true, attributeFilter: ['aria-label'] });
    window.__stopWorkingWatch = () => observer.disconnect();
  });
  await setRange(page, '#vec-food', '3');
  await expect.poll(() => page.evaluate(() => window.__workingLabels.includes('Working'))).toBe(true);
  await page.evaluate(() => window.__stopWorkingWatch());
  await expect(page.locator('#vec-food-val')).toHaveText('Prefer 3');
  await expect.poll(() => page.locator('#goLabel').textContent()).toBe('Find fair areas');
  const settings = await page.evaluate(() => localStorage.getItem('hkfair.v2.settings'));
  expect(settings).toContain('"food":3');
  expect(settings).toContain('"beta":{"vectors":true}');

  await setRange(page, '#vec-food', '-3');
  await expect(page.locator('#vec-food-val')).toHaveText('Avoid 3');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('hkfair.v2.settings'))).toContain('"food":-3');

  await page.locator('#betaBadge').click();
  await expect(page.locator('#vectorSection')).toBeHidden();
  await expect(page.locator('#legendVectorKey')).toBeHidden();
  await expect(page.locator('#exportDiagnostics')).toBeHidden();
  await expect(page.locator('#interestRatings')).toBeVisible();
  await expect.poll(() => page.locator('#detailSub').textContent()).not.toContain('preference');
});

test('heat cells reveal delayed interest tooltips and open a breakdown', async ({ page }) => {
  await page.locator('#go').click();
  const point = await clickableHeatCell(page);
  await page.mouse.move(point.x, point.y);
  await expect(page.locator('#mapTooltip')).toBeVisible({ timeout: 2500 });
  await expect(page.locator('#mapTooltip')).toContainText('Area interest fit');
  await expect.poll(() => page.locator('#mapTooltip').evaluate(el => Math.round(el.getBoundingClientRect().width))).toBe(240);
  await expect(page.locator('#mapTooltip b')).not.toHaveText('Area interest fit');
  await expect(page.locator('#mapTooltip .tooltip-sub')).toHaveText('Area interest fit');
  await expect(page.locator('#mapTooltip .tooltip-vector')).toHaveCount(6);
  await expect(page.locator('#mapTooltip')).not.toContainText('/100');
  await page.mouse.click(point.x, point.y);
  await expect(page.locator('#detail')).toBeVisible();
  await expect(page.locator('#detailTitle')).not.toBeEmpty();
});

test('interest tooltip shows normalized category ratings when beta is on', async ({ page }) => {
  await page.locator('#betaBadge').click();
  await page.locator('#go').click();
  const point = await clickableHeatCell(page);
  await page.mouse.move(point.x, point.y);
  await expect(page.locator('#mapTooltip')).toBeVisible({ timeout: 2500 });
  await expect(page.locator('#mapTooltip')).toContainText('Area interest fit');
  await expect(page.locator('#mapTooltip .tooltip-vector')).toHaveCount(6);
  await expect(page.locator('#mapTooltip .tooltip-fill')).toHaveCount(6);
  await expect(page.locator('#mapTooltip')).not.toContainText('/100');
  const widths = await page.locator('#mapTooltip .tooltip-fill').evaluateAll(fills => fills.map(fill => fill.style.width));
  expect(widths).toHaveLength(6);
  expect(widths.every(width => /^\d+%$/.test(width))).toBe(true);
});

// The synthetic fixture pins a station reachable only by changing lines, so
// the selected routes always contain an interchange wait.
async function selectAnInterchange(page) {
  await openInterchangeScenario(page);
  await expect(page.locator('#steps .step')).toHaveCount(2);
}

test('headway parameter persists through storage, reload and routes', async ({ page }) => {
  const headway = page.locator('#includeHeadway');
  await expect(headway).toBeChecked();
  await expect(page.locator('label[for="includeHeadway"]')).toHaveText('Include average headway');
  // Establish an interchange scenario while the parameter is still on.
  await selectAnInterchange(page);

  await headway.uncheck();
  await expect(headway).not.toBeChecked();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('hkfair.v2.settings'))).toContain('"includeHeadway":false');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  await expect(page.locator('#includeHeadway')).not.toBeChecked();

  await page.locator('#go').click();
  await expect.poll(() => page.locator('path.heat-cell').count()).toBeGreaterThan(0);
  await expect.poll(() => page.locator('.result-row').count()).toBeGreaterThan(0);
  // The restored pinned-point selection still requires a line change, but no
  // wait note may be shown while headway is off.
  await expect(page.locator('#steps .ride-leg .interchange-wait')).toHaveCount(0);

  await page.locator('#includeHeadway').check();
  await expect(page.locator('#includeHeadway')).toBeChecked();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('hkfair.v2.settings'))).toContain('"includeHeadway":true');
  // A fresh search is the deterministic sync point: the debounced automatic
  // recompute can finish before a "Working" label is ever observed.
  await page.locator('#go').click();
  await expect.poll(() => page.locator('path.heat-cell').count()).toBeGreaterThan(0);
  await expect.poll(() => page.locator('#goLabel').textContent()).toBe('Find fair areas');
  for (const note of await page.locator('.ride-leg .interchange-wait').allInnerTexts()) {
    expect(note).toMatch(/^Interchange wait\s+\d+\s+min$/);
  }
  // A contiguous rail group books its fare on the last rail leg, so check any
  // leg rather than assuming the first one carries the fare.
  const legMetas = await page.locator('.ride-leg .leg-meta').allInnerTexts();
  expect(legMetas.some(text => text.includes('Fare HK$'))).toBeTruthy();
  const railChips = await page.locator('.ride-leg.route-rail .leg-mode').allInnerTexts();
  for (const chip of railChips) {
    expect(chip).toMatch(/[A-Z][a-z]+\s+(?:[A-Z][a-z]+\s+)?(?:Line|Express)\b/);
    expect(chip).not.toMatch(/MTR\s+[A-Z]{3}\b/);
  }
  const legTimes = await page.locator('.leg-time').allInnerTexts();
  expect(legTimes.length).toBeGreaterThan(0);
  for (const text of legTimes) {
    expect(text).toMatch(/\b\d+\s+min\b/);
    expect(text).not.toMatch(/\d+\.\d+\s+min/);
  }
});

test('per-person walk tolerance defaults to 20 and persists through reload', async ({ page }) => {
  const card = page.locator('.card').first();
  const slider = card.locator('[data-walk]');
  await expect(slider).toHaveValue('20');
  await slider.evaluate(el => {
    el.value = '15';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(slider).toHaveValue('15');
  expect(await page.evaluate(() => localStorage.getItem('hkfair.v2.people'))).toMatch(/"walkMinutes":15/);
  await page.locator('#go').click();
  await expect.poll(() => page.locator('path.heat-cell').count()).toBeGreaterThan(0);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  await expect(page.locator('.card').first().locator('[data-walk]')).toHaveValue('15');
  await page.locator('#go').click();
  await expect.poll(() => page.locator('.result-row').count()).toBeGreaterThan(0);
  await expect(page.locator('#steps')).not.toContainText(/\b(route|results|map|people|mode|unit)\.[A-Za-z]/);
});

test('share links restore the current scenario', async ({ page }) => {
  await page.evaluate(() => {
    window.__copied = '';
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async text => { window.__copied = text; } },
    });
  });
  await page.locator('.card').first().locator('.name-input').fill('Alex');
  await page.locator('#includeHeadway').uncheck();
  await page.locator('.card').first().locator('[data-walk]').evaluate(el => {
    el.value = '10';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.locator('#go').click();
  await page.locator('#share').click();
  await expect(page.locator('#shareStatus')).toBeVisible();
  await expect(page.locator('#shareStatus')).toHaveText('Share link copied');
  await expect(page.locator('#shareStatus')).toHaveAttribute('role', 'status');
  await expect(page.locator('#share')).toHaveAttribute('data-tooltip', 'Share link copied');
  const sharedUrl = await page.evaluate(() => window.__copied);
  expect(sharedUrl).toContain('#s=');
  const state = await sharedState(page, sharedUrl);
  expect(state.people[0].name).toBe('Alex');
  expect(state.people[0]).not.toHaveProperty('focus');
  expect(state.people[0].walkMinutes).toBe(10);
  expect(state.settings.includeHeadway).toBe(false);
  await page.goto(sharedUrl);
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  await expect(page.locator('.name-input').first()).toHaveValue('Alex');
  await expect(page.locator('#includeHeadway')).not.toBeChecked();
  await expect(page.locator('.card').first().locator('[data-walk]')).toHaveValue('10');
});

test('sharing a setup before any search does not invent a selected result', async ({ page }) => {
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  await expect(page.locator('#nres')).toHaveText('');
  await page.evaluate(() => {
    window.__copied = '';
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async text => { window.__copied = text; } },
    });
  });
  await page.locator('#share').click();
  const url = await page.evaluate(() => window.__copied);
  const state = await sharedState(page, url);
  expect(state).not.toHaveProperty('selected');
  expect(state.people).toHaveLength(2);
});

test('legal buttons open the dialog with loaded documents and direct pages still work', async ({ page }) => {
  const documents = [
    { key: 'privacy', title: 'Privacy', body: 'What stays on your device' },
    { key: 'terms', title: 'Terms', body: 'Informational service' },
    { key: 'credits', title: 'Credits', body: 'Inspired by' },
    { key: 'process', title: 'Process', body: 'Routing runs in this browser' },
  ];
  for (const document of documents) {
    await page.locator(`.legal-links [data-legal="${document.key}"]`).click();
    await expect(page.locator('#legalDialog')).toBeVisible();
    await expect(page.locator('#legalTitle')).toHaveText(document.title);
    await expect(page.locator('#legalBody')).toContainText(document.body);
    await expect(page.locator('#legalBody nav')).toHaveCount(0);
    await page.locator('#legalDone').click();
    await expect(page.locator('#legalDialog')).toBeHidden();
  }

  await page.locator('.legal-links [data-legal="privacy"]').click();
  await expect(page.locator('#legalBody')).toContainText('What stays on your device');
  await page.locator('#legalClose').click();
  await expect(page.locator('#legalDialog')).toBeHidden();

  for (const document of documents) {
    const response = await page.request.get(`/${document.key}.html`);
    expect(response.ok()).toBeTruthy();
    expect(await response.text()).toContain(document.body);
  }
});

test('mobile tabs show one job at a time and keep the map key usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#mobileTabbar')).toBeVisible();
  await expect(page.locator('body')).toHaveAttribute('data-mobile-view', 'plan');
  await expect(page.locator('.main')).toBeHidden();

  await page.locator('#mobileTabbar [data-mobile-view="results"]').click();
  await expect(page.locator('.side-right')).toBeVisible();
  await expect(page.locator('.side-left')).toBeHidden();
  await expect(page.locator('.main')).toBeHidden();

  await page.locator('#mobileTabbar [data-mobile-view="map"]').click();
  await expect(page.locator('.main')).toBeVisible();
  await expect(page.locator('.side-right')).toBeHidden();
  await expect(page.locator('.side-left')).toBeHidden();

  await expect(page.locator('.legend')).toBeVisible();
  await expect(page.locator('.legend-head')).toBeVisible();
  // The key starts collapsed on phones so it does not cover the map.
  await expect(page.locator('#mapLegend')).not.toHaveClass(/open/);
  await expect(page.locator('#legendToggle')).toHaveAttribute('aria-expanded', 'false');
  await page.locator('#legendToggle').click();
  await expect(page.locator('#mapLegend')).toHaveClass(/open/);
  await expect(page.locator('#legendToggle')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.legend .cloud-key')).toBeVisible();
  await expect(page.locator('.legend .route-key')).toBeVisible();
  await expect(page.locator('.legend .pin-key')).toBeVisible();
  await expect(page.locator('.legend .recenter-key')).toBeVisible();
});


test('the desktop map key collapses and expands', async ({ page }) => {
  await expect(page.locator('#mapLegend')).toHaveClass(/open/);
  await expect(page.locator('#legendToggle')).toHaveAttribute('aria-expanded', 'true');
  const openHeight = await page.locator('#mapLegend').evaluate(el => Math.round(el.getBoundingClientRect().height));
  expect(openHeight).toBeGreaterThan(60);
  await page.locator('#legendToggle').click();
  await expect(page.locator('#mapLegend')).not.toHaveClass(/open/);
  await expect(page.locator('#legendToggle')).toHaveAttribute('aria-expanded', 'false');
  await expect.poll(() => page.locator('#legendBody').evaluate(el => Math.round(el.getBoundingClientRect().height))).toBe(0);
  await page.locator('#legendToggle').click();
  await expect(page.locator('#mapLegend')).toHaveClass(/open/);
  await expect.poll(() => page.locator('#mapLegend').evaluate(el => Math.round(el.getBoundingClientRect().height))).toBeGreaterThan(60);
});

test('changing a start place recomputes without pressing search', async ({ page }) => {
  await expect(page.locator('.card')).toHaveCount(2);
  await page.locator('.card').first().locator('.start-input').fill('Harbour City');
  await expect(page.locator('.card').first().locator('.suggestion').first()).toBeVisible();
  await page.locator('.card').first().locator('.suggestion').first().click();
  await expect.poll(() => page.locator('path.heat-cell').count()).toBeGreaterThan(0);
  await expect(page.locator('#error')).toBeHidden();
  // Only an explicit search flips the face; a recompute leaves it alone.
  await expect(page.locator('.side-left .face[data-face="detail"]')).toBeHidden();
});

test('adding and removing a person recomputes without pressing search', async ({ page }) => {
  await page.locator('#go').click();
  await expect.poll(() => page.locator('path.heat-cell').count()).toBeGreaterThan(0);
  await expect(page.locator('.side-left .face[data-face="detail"]')).toBeVisible();
  await page.locator('#swapFace').click();
  await expect(page.locator('.side-left .face[data-face="people"]')).toBeVisible();

  await page.locator('#add').click();
  await expect(page.locator('.card')).toHaveCount(3);
  await expect.poll(() => page.locator('path.heat-cell').count()).toBe(0);
  await expect(page.locator('#error')).toHaveText('Choose a start place for every person.');

  await page.locator('.card').nth(2).locator('.remove').click();
  await expect(page.locator('.card')).toHaveCount(2);
  await expect.poll(() => page.locator('path.heat-cell').count()).toBeGreaterThan(0);
  await expect(page.locator('#error')).toBeHidden();
});

test('a Photon outage shows an inline notice and no remote suggestions', async ({ page }) => {
  await page.route('**/photon.komoot.io/api/**', route => route.abort());
  const third = page.locator('.card').nth(2);
  await page.locator('#add').click();
  await third.locator('.start-input').fill('3 Canton Road');
  await expect(third.locator('.suggestion-error')).toBeVisible();
  await expect(third.locator('.suggestion')).toHaveCount(0);
  await expect(third.locator('.suggestion-error')).toContainText('Place search is unavailable');
});

async function pickStation(page, index, name) {
  const card = page.locator('.card').nth(index);
  await card.locator('.start-input').fill(name);
  const row = card.locator('.suggestion').filter({ hasText: name }).first();
  await expect(row).toBeVisible();
  await row.click();
}

test('empty place search shows a no-match message', async ({ page }) => {
  await page.route('**/photon.komoot.io/api/**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ features: [] }),
  }));
  await page.locator('#start-p1').fill('zzzzqqqq');
  await expect(page.locator('.card').first().locator('.suggestion-error')).toHaveText('No places match. Pick a transit stop or use a map pin.');
});

test('identical station starts say the person is already there', async ({ page }) => {
  await pickStation(page, 0, 'Central');
  await pickStation(page, 1, 'Central');
  await page.locator('#go').click();
  await expect.poll(() => page.locator('.result-row').count()).toBeGreaterThan(0);
  await expect(page.locator('#steps')).toContainText('Already there');
});

test('MTR-only Central to Kowloon Tong names the full rail line', async ({ page }) => {
  await pickStation(page, 0, 'Central');
  await pickStation(page, 1, 'Kowloon Tong');
  await page.locator('.chip[data-mode="bus"]').click();
  await page.locator('#go').click();
  await expect.poll(() => page.locator('.result-row').count()).toBeGreaterThan(0);
  await expect(page.locator('#steps')).toContainText(/Tsuen Wan Line|Kwun Tong Line/);
  await expect(page.locator('#steps')).not.toContainText(/MTR\s+(TWL|KTL)\b/);
  const dots = page.locator('#steps .ride-leg.route-rail .mtr-dot');
  expect(await dots.count()).toBeGreaterThan(0);
  for (const code of await dots.evaluateAll(nodes => nodes.map(node => node.dataset.line))) {
    expect(code).toMatch(/^[A-Z]{3}$/);
  }
  const dotColors = await dots.evaluateAll(nodes => [...new Set(nodes.map(node => getComputedStyle(node).backgroundColor))]);
  expect(dotColors.every(color => color !== 'rgb(138, 138, 138)')).toBe(true);
  await expect(page.locator('#error')).toBeHidden();
});

test('Airport Express fare is above the shared rail band', async ({ page }) => {
  await pickStation(page, 0, 'Tsim Sha Tsui');
  await pickStation(page, 1, 'Airport');
  await page.locator('.chip[data-mode="bus"]').click();
  await page.locator('#go').click();
  await expect.poll(() => page.locator('.result-row').count()).toBeGreaterThan(0);
  const fares = await page.locator('.fare.total').allInnerTexts();
  const amounts = fares.map(text => Number(text.replace(/[^0-9.]/g, ''))).filter(value => Number.isFinite(value));
  expect(Math.max(...amounts)).toBeGreaterThan(40);
});

test('MTR-only Nam Cheong and Tuen Mun still returns an area', async ({ page }) => {
  await pickStation(page, 0, 'Nam Cheong');
  await pickStation(page, 1, 'Tuen Mun');
  await page.locator('.chip[data-mode="bus"]').click();
  await page.locator('#go').click();
  await expect.poll(() => page.locator('.result-row').count()).toBeGreaterThan(0);
  await expect(page.locator('#error')).toBeHidden();
});

test('Urdu puts the people panel on the right', async ({ page }) => {
  await page.locator('#locale').selectOption('ur');
  await expect.poll(() => page.locator('html').getAttribute('dir')).toBe('rtl');
  const boxes = await page.evaluate(() => ({
    people: document.querySelector('.side-left').getBoundingClientRect().x,
    options: document.querySelector('.side-right').getBoundingClientRect().x,
  }));
  expect(boxes.people).toBeGreaterThan(boxes.options);
});

test('shipped graph reflects the builder\'s rail-hop repairs', async ({ page }) => {
  // Thresholds below come from the constants in scripts/build_graph.py.
  const report = await page.evaluate(async () => {
    const net = await (await fetch('data/network.json')).json();
    const nodes = await (await fetch('data/nodes.json')).json();
    const hav = (i, j) => {
      const r = Math.PI / 180;
      const dlat = (nodes.lat[j] - nodes.lat[i]) * r;
      const dlon = (nodes.lon[j] - nodes.lon[i]) * r;
      const h = Math.sin(dlat / 2) ** 2 + Math.cos(nodes.lat[i] * r) * Math.cos(nodes.lat[j] * r) * Math.sin(dlon / 2) ** 2;
      return 2 * 6371000 * Math.asin(Math.sqrt(h));
    };
    const base = name => String(name).split(' · ')[0];
    let airportTsingYi = null;
    let shortSlow = 0;
    for (const line of net.lines) {
      if (line.e.length !== line.s.length - 1) continue;
      for (let i = 0; i < line.e.length; i++) {
        const dist = hav(line.s[i], line.s[i + 1]);
        if (dist < 800 && line.e[i] >= 15) shortSlow += 1;
        if (line.l === 'MTR AEL') {
          const ends = new Set([base(nodes.names[line.s[i]]), base(nodes.names[line.s[i + 1]])]);
          if (ends.has('Airport') && ends.has('Tsing Yi')) airportTsingYi = line.e[i];
        }
      }
    }
    return { airportTsingYi, shortSlow };
  });
  expect(report.airportTsingYi).toBeLessThan(16);
  expect(report.shortSlow).toBe(0);
});

test('a late place search does not reopen a chosen stop', async ({ page }) => {
  // Two promise gates replace the fixed sleep. The handler announces when the
  // remote request actually arrives, then holds the response until the local
  // stop has been chosen; the test releases it explicitly so "late" means
  // after the pick, never "after N milliseconds".
  let requestSeenResolve;
  const requestSeen = new Promise(r => { requestSeenResolve = r; });
  let releaseLate;
  const late = new Promise(r => { releaseLate = r; });
  await page.route('**/photon.komoot.io/api/**', async route => {
    requestSeenResolve?.();
    requestSeenResolve = null;
    await late;
    try {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ features: [{
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [114.173, 22.278] },
          properties: { name: 'Central Plaza', city: 'Hong Kong', country: 'Hong Kong', osm_type: 'way', osm_id: '9' },
        }] }),
      });
    } catch {
      // The app may abort the superseded lookup; the late arrival is the point.
    }
  });
  const card = page.locator('.card').first();
  const input = card.locator('.start-input');
  await input.fill('Central');
  const row = card.locator('.suggestion').filter({ has: page.locator('.place-main', { hasText: /^Central$/ }) }).first();
  await expect(row).toBeVisible();
  await requestSeen;
  await row.click();
  await expect(input).toHaveValue('Central');
  await expect(card.locator('.suggestions')).toBeHidden();
  releaseLate();
  await expect(card.locator('.suggestions')).toBeHidden();
});

test('a two-character Chinese query returns places', async ({ page }) => {
  await page.route('**/photon.komoot.io/api/**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ features: [{
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [114.158, 22.281] },
      properties: { name: '中環', city: '香港', country: '香港', osm_type: 'node', osm_id: '8' },
    }] }),
  }));
  const card = page.locator('.card').first();
  await card.locator('.start-input').fill('中環');
  await expect(card.locator('.suggestion').first()).toContainText('中環');
});

test('legal pages include social preview tags', async ({ page }) => {
  for (const name of ['privacy', 'terms', 'credits', 'process']) {
    const body = await (await page.request.get(`/${name}.html`)).text();
    expect(body).toContain('property="og:title"');
    expect(body).toContain('name="twitter:card"');
    expect(body).toContain('content="https://zg852.pages.dev/og-image.png?v=2"');
  }
});

test('the first start field rises above the fixed controls when focused', async ({ page }) => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 360, height: 640 }]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => document.activeElement?.blur?.());
    const planTab = page.locator('#mobileTabbar [data-mobile-view="plan"]');
    await expect(planTab).toBeVisible();
    await planTab.click();
    // Measure the real fixed bars before focusing: both hide while the
    // keyboard is open, so the field must stay above their actual position.
    const tabBox = await page.locator('#mobileTabbar').boundingBox();
    const goBox = await page.locator('#go').boundingBox();
    expect(tabBox).not.toBeNull();
    expect(goBox).not.toBeNull();
    const fixedTop = Math.min(tabBox.y, goBox.y);
    const input = page.locator('.start-input').first();
    await input.focus();
    await expect(page.locator('body')).toHaveClass(/keyboard-open/);
    await expect(page.locator('#mobileTabbar')).toBeHidden();
    await expect(page.locator('#go')).toBeHidden();
    const box = await input.boundingBox();
    expect(box).not.toBeNull();
    expect(box.y + box.height).toBeLessThanOrEqual(fixedTop + 1);
  }
});

test('mobile-only deck controls stay hidden on desktop', async ({ page }) => {
  await expect(page.locator('#mobileTabbar')).toBeHidden();
  await expect(page.locator('#closeRoute')).toBeHidden();
  await expect(page.locator('#mobileBeta')).toBeHidden();
  await expect(page.locator('.layout')).toHaveCSS('display', 'grid');
});

