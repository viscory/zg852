const { test, expect } = require('@playwright/test');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

function deployedPolicy(response) {
  return response.headers()['content-security-policy']
    || readFileSync(join(__dirname, '..', 'public', '_headers'), 'utf8');
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
  await page.locator(id).evaluate((el, next) => {
    el.value = next;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}

async function catalog(page, code) {
  return page.evaluate(async language => {
    const response = await fetch(`i18n/${language}.json`);
    if (!response.ok) throw new Error(`Missing ${language}`);
    return response.json();
  }, code);
}

async function clickableHeatCell(page) {
  await expect.poll(() => page.locator('path.heat-cell').count()).toBeGreaterThan(0);
  await page.waitForTimeout(500);
  const point = await page.locator('path.heat-cell').evaluateAll(elements => {
    const candidates = elements.map(el => el.getBoundingClientRect())
      .filter(rect => rect.width > 8 && rect.height > 8 && rect.x > 300 && rect.y > 150 && rect.x < 900 && rect.y < 550)
      .map(rect => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }));
    return candidates.find(candidate => document.elementFromPoint(candidate.x, candidate.y)?.classList.contains('heat-cell')) || null;
  });
  expect(point).not.toBeNull();
  return point;
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
  await expect(page.locator('.brand .sub')).toHaveText('Find the most convenient meeting point for everyone');
  await expect(page.locator('.brand .sub')).toHaveText(en['app.subtitle']);
  await expect(page.locator('.brand .meaning')).toHaveCount(0);
  await expect(page.locator('.chip[data-mode="rail"]')).toHaveAttribute('aria-label', 'MTR');
  await expect(page.locator('.route-key [data-i18n="map.railKey"]')).toHaveText('MTR');
  await expect(page.locator('#tolerance')).toHaveAttribute('min', '0.05');
  await expect(page.locator('label[for="tolerance"]')).toHaveText('Up to 300% the slowest person may take that many times the fastest. Past 300% the map is unbounded: tap anywhere to pick a point.');
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
  const policy = deployedPolicy(home);
  expect(policy).toContain("script-src 'self'");
  expect(policy).not.toContain('unsafe-inline');
  const llmsHeaders = await page.request.get('/llms.txt');
  const cache = llmsHeaders.headers()['cache-control'] || policy;
  expect(cache).toContain('max-age=3600');
});

test('production bundle avoids importmaps and CSP exceptions', async ({ page }) => {
  const index = await page.evaluate(async () => (await (await fetch('index.html')).text()));
  const app = await page.evaluate(async () => (await (await fetch('app.js')).text()));
  const policy = deployedPolicy(await page.request.get('/'));
  expect(index).not.toContain('importmap');
  expect(index).toMatch(/<script type="module"[^>]*src="\/app\.js">/);
  expect(app).toContain('tiles.openfreemap.org/planet');
  expect(app).not.toContain('style="');
  expect(app).not.toContain('.style.cssText');
  expect(policy).toContain("script-src 'self'");
  expect(policy).not.toContain('unsafe-inline');
});

test('clean basemap adds keyless place labels without raster tiles', async ({ page }) => {
  const source = await page.evaluate(async () => (await (await fetch('app.js')).text()));
  expect(source).not.toContain('tile.openstreetmap.org');
  expect(source).toContain('tiles.openfreemap.org/planet');
  expect(source).toContain('/fonts/{fontstack}/{range}.pbf');
  expect(source).toMatch(/source-layer['"]?\s*:\s*['"]place/);
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
  // The default scenario can favour buses now that first boardings no longer
  // carry headway wait. Full MTR names are asserted in the dedicated rail tests.
  const railChips = await page.locator('.ride-leg.route-rail .leg-mode').allInnerTexts();
  for (const chip of railChips) {
    expect(chip).not.toMatch(/MTR\s+[A-Z]{3}\b/);
  }
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
  await expect(page.locator('#emptyRun')).toBeVisible();
  await expect(page.locator('.side-left .face[data-face="detail"]')).toBeHidden();
  await page.locator('#emptyRun').click();
  await expect.poll(() => page.locator('.result-row').count()).toBeGreaterThan(0);
  await expect(page.locator('.side-left .face[data-face="detail"]')).toBeVisible();
  await expect(page.locator('#detail')).toBeVisible();
});

test('interchange waits are charged only after the first transit leg', async ({ page }) => {
  // The wait note is a headway feature, so this scenario needs the default on.
  await expect(page.locator('#includeHeadway')).toBeChecked();
  // One `.step` is one person's route; ride legs inside it are in travel order.
  // Return the interchange notes attached to each ride leg of each route.
  const routeWaits = () => page.locator('#steps .step').evaluateAll(steps => steps.map(step => {
    const rides = [...step.querySelectorAll('.ride-leg')];
    return rides.map(ride => [...ride.querySelectorAll('.interchange-wait')].map(note => note.textContent.trim()));
  }));
  const hasInterchange = routes => routes.some(route => route.length >= 2
    && route[0].length === 0
    && route.slice(1).every(notes => notes.length === 1));

  // The default pair can meet on a single line, so fall back to origins on
  // lines that have no direct interchange before giving up.
  const pairs = [
    null,
    ['Tsim Sha Tsui', 'Airport'],
    ['Lo Wu', 'Airport'],
    ['Lo Wu', 'Tsim Sha Tsui'],
  ];
  let found = false;
  for (const pair of pairs) {
    if (pair) {
      // Selecting a result reveals the detail face; bring the people face back
      // so the start fields can be edited.
      if (!await page.locator('.face[data-face="people"]').isVisible()) {
        await page.locator('#swapFace').click();
      }
      await expect(page.locator('.face[data-face="people"]')).toBeVisible();
      await pickStation(page, 0, pair[0]);
      await pickStation(page, 1, pair[1]);
    }
    await page.locator('#go').click();
    try {
      await expect.poll(() => page.locator('.result-row').count()).toBeGreaterThan(0);
    } catch {
      continue;
    }
    const rows = page.locator('.result-row');
    const rowCount = Math.min(await rows.count(), 24);
    for (let i = 0; i < rowCount; i++) {
      await rows.nth(i).click();
      if (hasInterchange(await routeWaits())) {
        found = true;
        break;
      }
    }
    if (found) break;
  }
  // Never let the test pass without actually seeing an interchange.
  expect(found).toBe(true);

  const routes = await routeWaits();
  const interchange = routes.find(route => route.length >= 2
    && route[0].length === 0
    && route.slice(1).every(notes => notes.length === 1));
  expect(interchange).toBeTruthy();
  expect(interchange.length).toBeGreaterThanOrEqual(2);
  expect(interchange[0]).toEqual([]);
  // The first boarding of every person's route is free of headway wait.
  expect(routes.every(route => route.length === 0 || route[0].length === 0)).toBe(true);

  const notes = await page.locator('.ride-leg .interchange-wait').allInnerTexts();
  expect(notes.length).toBeGreaterThan(0);
  for (const note of notes) {
    expect(note).toMatch(/^Interchange wait\s+\d+\s+min$/);
    expect(note).not.toMatch(/\d+\.\d+\s+min/);
  }
  expect(await page.locator('.ride-leg .leg-meta .interchange-wait').count()).toBe(notes.length);
});

test('travel budget slider is gone', async ({ page }) => {
  await expect(page.locator('#budget')).toHaveCount(0);
  await expect(page.locator('#budgetval')).toHaveCount(0);
  await expect(page.locator('label[for="budget"]')).toHaveCount(0);
});

test('right sidebar footer carries attribution, inspiration and project links', async ({ page }) => {
  const footer = page.locator('.side-right footer');
  await expect(footer).toBeVisible();
  await expect(footer).toContainText('Routing runs in this browser');
  await expect(footer).toContainText('Inspired by');
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
    expect(link.href).toMatch(/^https:\/\/hkbus\.app\/en\/(?:route|search)/);
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
  await expect(page.locator('aside.side-right')).toHaveAttribute('aria-label', 'Parameters and results');
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
  const allowed = ['#7F1D1D', '#991B1B', '#B91C1C', '#DC2626', '#EF4444', '#FCA5A5'];
  expect(fills.length).toBeGreaterThan(0);
  expect(fills.every(fill => allowed.includes(fill))).toBe(true);
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
  await expect(page.locator('#tolerance')).toHaveAttribute('min', '0.05');
  await expect(page.locator('#tolerance')).toHaveAttribute('max', '3.05');
  await expect(page.locator('#tolerance')).toHaveAttribute('step', '0.05');
  await setRange(page, '#tolerance', '3');
  await expect(page.locator('#tolval')).toHaveText('300%');
  await expect(page.locator('#unboundedHint')).toBeHidden();

  await setRange(page, '#tolerance', '3.05');
  await expect(page.locator('#tolval')).toHaveText('Unlimited');
  await expect(page.locator('#unboundedHint')).toBeVisible();
  await page.locator('#go').click();
  await expect.poll(() => page.locator('.result-row').count()).toBeGreaterThan(0);
  await expect(page.locator('path.heat-cell')).toHaveCount(0);

  const mapBox = await page.locator('#map').boundingBox();
  expect(mapBox).not.toBeNull();
  await page.mouse.click(mapBox.x + mapBox.width * 0.52, mapBox.y + mapBox.height * 0.55);
  await expect(page.locator('#pointBanner')).toBeVisible();
  await expect(page.locator('#detailTitle')).toHaveText('Pinned point');
  await expect(page.locator('#steps')).toContainText('Pinned point');

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

  const downloadPromise = page.waitForEvent('download');
  await page.locator('#exportDiagnostics').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^zg852-diagnostics-\d{8}-\d{4}\.json$/);

  const file = JSON.parse(readFileSync(await download.path(), 'utf8'));
  expect(file.schema).toBe(1);
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
  await page.waitForTimeout(700);

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
  await expect(page.locator('#tolerance')).toHaveValue('0.25');

  await page.locator('#locale').selectOption('en');
  await expect.poll(() => page.locator('html').getAttribute('lang')).toBe('en');

  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  await expect(page.locator('.card')).toHaveCount(2);
  await expect(page.locator('.name-input').first()).toHaveValue('Person A');
  await expect(page.locator('#tolerance')).toHaveValue('0.1');
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

test('all catalogues keep the same keys and avoid ranking wording', async ({ page }) => {
  const catalogues = await Promise.all(LOCALES.map(code => catalog(page, code)));
  const expected = Object.keys(catalogues[0]).sort();
  expect(expected).toHaveLength(155);
  for (const key of ['app.subtitle', 'options.includeHeadway', 'options.tolerance', 'options.unbounded', 'route.rideLeg', 'route.stops', 'route.busLink', 'route.walkTo', 'route.interchangeWait', 'route.stopCount_other', 'map.pickAnywhere', 'map.pinnedPoint', 'map.clearPoint', 'diag.button', 'diag.help', 'results.fareTotal', 'results.noFitMtr', 'legal.privacy', 'legal.terms', 'legal.credits', 'legal.process', 'legal.close']) {
    expect(Object.keys(catalogues[0])).toContain(key);
  }
  for (const key of ['app.meaning', 'people.focusLabel', 'people.focusTime', 'people.focusCost']) {
    expect(Object.keys(catalogues[0])).not.toContain(key);
  }
  expect(catalogues[0]['app.title']).toBe('就腳 zau6 goek3');
  expect(catalogues[0]['app.subtitle']).toBe('Find the most convenient meeting point for everyone');
  expect(catalogues[0]['options.rail']).toBe('MTR');
  expect(catalogues[0]['mode.rail']).toBe('MTR');
  expect(catalogues[0]['map.railKey']).toBe('MTR');
  expect(catalogues[0]['options.tolerance']).toBe('Up to 300% the slowest person may take that many times the fastest. Past 300% the map is unbounded: tap anywhere to pick a point.');
  expect(catalogues[0]['results.fareTotal']).toBe('Fare {value}');
  expect(catalogues[0]['results.noFitMtr']).toContain('MTR');
  for (const entries of catalogues) {
    expect(Object.keys(entries).sort()).toEqual(expected);
    for (const value of Object.values(entries)) {
      expect(String(value)).not.toMatch(/\brank(ed|ing)?\b/i);
    }
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
  await expect(page.locator('#error')).toHaveText('No areas fit this tolerance. Increase tolerance or enable another mode.');
});

test('MTR-only search still finds fair areas with default settings', async ({ page }) => {
  await expect(page.locator('.card')).toHaveCount(2);
  await expect(page.locator('.chip[data-mode="rail"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#tolerance')).toHaveValue('0.1');
  await page.locator('.chip[data-mode="bus"]').click();
  await expect(page.locator('.chip[data-mode="bus"]')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#go').click();
  await expect.poll(() => page.locator('path.heat-cell').count()).toBeGreaterThan(0);
  await expect.poll(() => page.locator('.result-row').count()).toBeGreaterThan(0);
  await expect(page.locator('#error')).toBeHidden();
  await expect(page.locator('.result-row').first().locator('.fare.total').first()).toContainText('Fare HK$');
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
  await expect(page.locator('.start-input').first()).toHaveValue(/^Pin /);
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
  await Promise.all([
    page.waitForResponse(response => response.url().includes('poi-index.json')),
    page.locator('#betaBadge').click(),
  ]);
  await expect(page.locator('#vectorSection')).toBeVisible();
  await expect(page.locator('#legendVectorKey')).toBeVisible();
  for (const key of ['food', 'drinks', 'activities', 'culture', 'outdoors', 'shopping']) {
    await expect(page.locator(`#vec-${key}`)).toHaveValue('0');
    await expect(page.locator(`#vec-${key}-val`)).toHaveText('Off');
    await expect(page.locator(`.vector-row:has(#vec-${key}) .icon`)).toBeVisible();
  }
  await expect(page.locator('.vector-help')).toContainText('travel time');
  await page.locator('#go').click();
  await expect.poll(() => page.locator('path.heat-cell').count()).toBeGreaterThan(0);
  await expect(page.locator('.fit-row')).toHaveCount(0);
  await expect(page.locator('#detailSub')).toContainText('No preference applied');

  await page.evaluate(() => {
    window.__searchStates = [];
    const label = document.getElementById('goLabel');
    new MutationObserver(() => window.__searchStates.push(label.textContent)).observe(label, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  });
  await setRange(page, '#vec-food', '3');
  await expect(page.locator('#vec-food-val')).toHaveText('Prefer 3');
  await expect.poll(() => page.evaluate(() => window.__searchStates)).toContain('Working');
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
  await expect.poll(() => page.locator('#detailSub').textContent()).not.toContain('preference');
});

test('heat cells reveal delayed interest tooltips and open a breakdown', async ({ page }) => {
  await page.locator('#go').click();
  const point = await clickableHeatCell(page);
  await page.mouse.move(point.x, point.y);
  await expect(page.locator('#mapTooltip')).toBeVisible({ timeout: 2500 });
  await expect(page.locator('#mapTooltip .tooltip-vector')).toHaveCount(0);
  await expect(page.locator('#mapTooltip')).not.toContainText('Area interest fit');
  await page.mouse.click(point.x, point.y);
  await expect(page.locator('#detail')).toBeVisible();
  await expect(page.locator('#detailTitle')).not.toBeEmpty();
});

// Leaves the page on a result whose route really has an interchange, so tests
// about the wait note cannot pass on a single-leg route by accident.
async function selectAnInterchange(page) {
  const pairs = [
    null,
    ['Tsim Sha Tsui', 'Airport'],
    ['Lo Wu', 'Airport'],
    ['Lo Wu', 'Tsim Sha Tsui'],
  ];
  for (const pair of pairs) {
    if (pair) {
      if (!await page.locator('.face[data-face="people"]').isVisible()) {
        await page.locator('#swapFace').click();
      }
      await expect(page.locator('.face[data-face="people"]')).toBeVisible();
      await pickStation(page, 0, pair[0]);
      await pickStation(page, 1, pair[1]);
    }
    await page.locator('#go').click();
    try {
      await expect.poll(() => page.locator('.result-row').count()).toBeGreaterThan(0);
    } catch {
      continue;
    }
    const rows = page.locator('.result-row');
    const rowCount = Math.min(await rows.count(), 24);
    for (let i = 0; i < rowCount; i++) {
      await rows.nth(i).click();
      if (await page.locator('#steps .ride-leg .interchange-wait').count() > 0) return true;
    }
  }
  return false;
}

test('headway parameter persists through storage, reload and routes', async ({ page }) => {
  const headway = page.locator('#includeHeadway');
  await expect(headway).toBeChecked();
  await expect(page.locator('label[for="includeHeadway"]')).toHaveText('Include average headway');
  // Establish an interchange scenario while the parameter is still on.
  expect(await selectAnInterchange(page)).toBe(true);

  await headway.uncheck();
  await expect(headway).not.toBeChecked();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('hkfair.v2.settings'))).toContain('"includeHeadway":false');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  await expect(page.locator('#includeHeadway')).not.toBeChecked();

  await page.locator('#go').click();
  await expect.poll(() => page.locator('path.heat-cell').count()).toBeGreaterThan(0);
  await expect.poll(() => page.locator('.result-row').count()).toBeGreaterThan(0);
  const rows = page.locator('.result-row');
  const offCount = Math.min(await rows.count(), 24);
  let sawInterchange = false;
  for (let i = 0; i < offCount; i++) {
    await rows.nth(i).click();
    await expect(page.locator('#steps .ride-leg .interchange-wait')).toHaveCount(0);
    const multiRide = await page.locator('#steps .step').evaluateAll(steps => steps.some(step => step.querySelectorAll('.ride-leg').length >= 2));
    if (multiRide) sawInterchange = true;
  }
  expect(sawInterchange).toBe(true);

  await page.locator('#includeHeadway').check();
  await expect(page.locator('#includeHeadway')).toBeChecked();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('hkfair.v2.settings'))).toContain('"includeHeadway":true');
  // A fresh search is the deterministic sync point: the debounced automatic
  // recompute can finish before a "Working" label is ever observed.
  await page.locator('#go').click();
  await expect.poll(() => page.locator('path.heat-cell').count()).toBeGreaterThan(0);
  await expect.poll(() => page.locator('#goLabel').textContent()).toBe('Find fair areas');
  const onCount = Math.min(await rows.count(), 24);
  let notesReturned = false;
  for (let i = 0; i < onCount; i++) {
    await rows.nth(i).click();
    if (await page.locator('#steps .ride-leg .interchange-wait').count() > 0) {
      notesReturned = true;
      break;
    }
  }
  expect(notesReturned).toBe(true);
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

test('legal buttons open the dialog with loaded documents and direct pages still work', async ({ page }) => {
  const documents = [
    { key: 'privacy', title: 'Privacy', body: 'What stays on your device' },
    { key: 'terms', title: 'Terms', body: 'Informational service' },
    { key: 'credits', title: 'Credits', body: 'Transit data' },
    { key: 'process', title: 'Process', body: 'Routing runs in this browser' },
  ];
  for (const document of documents) {
    await page.locator(`[data-legal="${document.key}"]`).click();
    await expect(page.locator('#legalDialog')).toBeVisible();
    await expect(page.locator('#legalTitle')).toHaveText(document.title);
    await expect(page.locator('#legalBody')).toContainText(document.body);
    await expect(page.locator('#legalBody nav')).toHaveCount(0);
    await page.locator('#legalDone').click();
    await expect(page.locator('#legalDialog')).toBeHidden();
  }

  await page.locator('[data-legal="privacy"]').click();
  await expect(page.locator('#legalBody')).toContainText('What stays on your device');
  await page.locator('#legalClose').click();
  await expect(page.locator('#legalDialog')).toBeHidden();

  for (const document of documents) {
    const response = await page.request.get(`/${document.key}.html`);
    expect(response.ok()).toBeTruthy();
    expect(await response.text()).toContain(document.body);
  }
});

test('mobile layout keeps the map, both panels, and the legend usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#map')).toBeVisible();
  await expect(page.locator('.side-left')).toBeVisible();
  await expect(page.locator('.side-right')).toBeVisible();
  await expect(page.locator('.legend')).toBeVisible();
  await expect(page.locator('.legend-head')).toBeVisible();
  await expect(page.locator('.legend .vector-key')).toBeHidden();
  await expect(page.locator('.legend .pin-key')).toBeVisible();
  await expect(page.locator('.legend .recenter-key')).toBeVisible();
  await expect(page.locator('.legend .cloud-key')).toBeVisible();
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

test('a Photon outage falls back to local stops with an inline notice', async ({ page }) => {
  await page.route('**/photon.komoot.io/api/**', route => route.abort());
  const third = page.locator('.card').nth(2);
  await page.locator('#add').click();
  await third.locator('.start-input').fill('3 Canton Road');
  await page.waitForTimeout(600);
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

test('shipped graph keeps plausible hop times', async ({ page }) => {
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
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/photon.komoot.io/api/**', async route => {
    await gate;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ features: [{
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [114.173, 22.278] },
        properties: { name: 'Central Plaza', city: 'Hong Kong', country: 'Hong Kong', osm_type: 'way', osm_id: '9' },
      }] }),
    });
  });
  const card = page.locator('.card').first();
  const input = card.locator('.start-input');
  await input.fill('Central');
  const row = card.locator('.suggestion').filter({ has: page.locator('.place-main', { hasText: /^Central$/ }) }).first();
  await row.click();
  await expect(input).toHaveValue('Central');
  await expect(card.locator('.suggestions')).toBeHidden();
  release();
  await page.waitForTimeout(700);
  await expect(card.locator('.suggestions')).toBeHidden();
  await expect(input).toHaveValue('Central');
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

test('the first start field sits above the bottom keyboard zone', async ({ page }) => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 360, height: 640 }]) {
    await page.setViewportSize(viewport);
    const box = await page.locator('.start-input').first().boundingBox();
    expect(box.y).toBeLessThanOrEqual(viewport.height - 300);
  }
});

