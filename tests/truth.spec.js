const { test, expect } = require('@playwright/test');
const { readFileSync } = require('node:fs');

// The production service worker calls clients.claim(), which can take over a
// page mid-test and bypass page.route(). Keep these copy/data checks isolated.
test.use({ serviceWorkers: 'block' });

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
  await page.route('**/photon.komoot.io/api/**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ features: [] }),
  }));
});

test('copy states the real targets, floors and diagnostics export', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  await expect(page.locator('.brand .sub')).toHaveText('Find a fair meeting point in Hong Kong');
  await expect(page.locator('body')).not.toContainText('most convenient');
  await expect(page.locator('#toleranceLabel')).toHaveText('Target time difference');
  await expect(page.locator('#toleranceHelp')).toBeVisible();
  await expect(page.locator('#toleranceHelp')).toContainText('8 min');
  await expect(page.locator('#toleranceHelp')).toContainText('HK$1');

  const en = await (await page.request.get('i18n/en.json')).json();
  // Interest ratings are informational: a rated area must rank identically to
  // the same area without ratings. This replaces the old assertion that three
  // deleted preference keys were still absent.
  const { loadSourceModule } = require('./source-modules');
  const { compareAreaRank, areaRank } = await loadSourceModule('model.js');
  const plain = { key: 'x', fitScore: 12, shownSlowest: 30, shownGap: 8 };
  const rated = { ...plain, fit: 9, rating: 100, ratings: { food: 10 } };
  expect(areaRank(plain)).toEqual(areaRank(rated));
  expect(compareAreaRank(plain, rated)).toBe(0);
  expect(en['options.interestsHelp']).toContain('do not change ranking');

  await page.locator('#betaBadge').click();
  await expect(page.locator('.beta-disclosure')).toBeVisible();
  await expect(page.locator('.beta-disclosure')).toContainText('Diagnostics');
  await expect(page.locator('.beta-disclosure')).toContainText('copies');
  await expect(page.locator('.vector-help')).toContainText('travel time');
  await expect(page.locator('#exportDiagnostics')).toBeVisible();
});

test('no-JavaScript fallback copy matches the English catalogue', async ({ page }) => {
  const en = await (await page.request.get('i18n/en.json')).json();
  const html = await (await page.request.get('/')).text();
  for (const key of ['map.areaHint', 'map.vectorKey', 'map.recenterKey', 'options.interestsHelp', 'beta.diagnosticsHelp', 'results.fareNote', 'results.walkPreference']) {
    expect(html, `${key} must appear verbatim in the fallback page`).toContain(en[key]);
  }
  // The byte-for-byte per-key comparison in the test below already fails on
  // any stale literal, so no list of banned old phrases is needed here.
});

test('no-JavaScript fallbacks match the English catalogue except two documented shorter labels', async ({ page }) => {
  const html = readFileSync('public/index.html', 'utf8');
  const en = JSON.parse(readFileSync('static/i18n/en.json', 'utf8'));
  // Reviewed exceptions: these no-JS literals are deliberately shorter than
  // their catalogue counterparts, and are not stale translations:
  // - legal.title: the fallback aria-label on <nav class="legal-links"> is
  //   "Legal"; en.json carries the longer page heading "Legal and project
  //   information".
  // - diag.help: the fallback tooltip on #exportDiagnostics is "Diagnostics";
  //   en.json carries the full sentence explaining the export.
  // Every other fallback is still compared byte-for-byte with en.json below.
  const shorterLabels = new Set(['legal.title', 'diag.help']);

  // Parse the markup with the browser DOM parser so the comparison is
  // attribute-to-value rather than a regex over implementation strings.
  const fallbacks = await page.evaluate(markup => {
    const doc = new DOMParser().parseFromString(markup, 'text/html');
    const sources = [
      ['data-i18n', [null]],
      ['data-i18n-placeholder', ['placeholder']],
      ['data-i18n-aria-label', ['aria-label']],
      ['data-i18n-title', ['title']],
      ['data-i18n-tooltip', ['data-tooltip', 'title']],
    ];
    const found = [];
    const selector = sources.map(([attr]) => `[${attr}]`).join(', ');
    for (const el of doc.querySelectorAll(selector)) {
      for (const [keyAttr, fallbackAttrs] of sources) {
        const key = el.getAttribute(keyAttr);
        if (!key) continue;
        for (const fallbackAttr of fallbackAttrs) {
          const literal = fallbackAttr === null
            ? (el.children.length ? null : (el.textContent || '').trim())
            : el.getAttribute(fallbackAttr);
          if (literal === null) continue;
          found.push({ key, source: fallbackAttr || 'text', literal });
          break;
        }
      }
    }
    return found;
  }, html);

  // Derive the expected key set from an independent pass over the same built
  // markup instead of pinning an arbitrary "more than 100" count.
  const keysInMarkup = await page.evaluate(markup => {
    const doc = new DOMParser().parseFromString(markup, 'text/html');
    const attrs = ['data-i18n', 'data-i18n-placeholder', 'data-i18n-aria-label', 'data-i18n-title', 'data-i18n-tooltip'];
    return [...new Set([...doc.querySelectorAll(attrs.map(attr => `[${attr}]`).join(','))]
      .flatMap(el => attrs.map(attr => el.getAttribute(attr)).filter(Boolean)))];
  }, html);
  expect(new Set(fallbacks.map(entry => entry.key))).toEqual(new Set(keysInMarkup));
  const seen = new Set(fallbacks.map(entry => entry.key));
  for (const key of shorterLabels) {
    expect([...seen], `${key} allowlisted but no literal fallback found`).toContain(key);
  }
  for (const { key, source, literal } of fallbacks) {
    expect(en[key], `en.json is missing ${key}`).toBeDefined();
    if (shorterLabels.has(key)) continue;
    expect(literal, `${key} ${source} fallback must equal en.json`).toBe(en[key]);
  }
});

test('the privacy page discloses every localStorage key the app uses', async () => {
  const { loadSourceModule } = require('./source-modules');
  const { KEY } = await loadSourceModule('config.js');
  const privacy = readFileSync('PRIVACY.md', 'utf8');
  for (const key of [...Object.values(KEY), 'hkfair.v2.selection']) {
    expect(privacy, `${key} must be disclosed in PRIVACY.md`).toContain(key);
  }
});

test('the results heading counts only the displayed top areas', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  await page.locator('#go').click();
  await expect.poll(() => page.locator('.result-row').count()).toBeGreaterThan(0);
  const rows = await page.locator('.result-row').count();
  const en = await (await page.request.get('i18n/en.json')).json();
  await expect(page.locator('#nres')).toHaveText(en['results.header'].replace('{count}', String(rows)));
});

test('displayed route minutes add up to the displayed total', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  await page.locator('#go').click();
  await expect.poll(() => page.locator('.result-row').count()).toBeGreaterThan(0);
  const rows = await page.locator('.result-row').count();
  for (let i = 0; i < rows; i++) {
    await page.locator('.result-row').nth(i).click();
    await expect(page.locator('#steps .step')).not.toHaveCount(0);
    const steps = await page.locator('#steps .step').all();
    for (const step of steps) {
      const parts = await step.locator('.leg-time, .walk-leg .ride-text, .interchange-wait').allInnerTexts();
      const sum = parts.reduce((total, text) => total + Number((text.match(/(\d+)\s*min/) || [0, 0])[1]), 0);
      const totalText = await step.locator('.route-meta .muted').innerText();
      const total = Number((totalText.match(/(\d+)/) || [0, 0])[1]);
      expect(sum, `leg minutes for "${totalText}" must add up`).toBe(total);
    }
  }
});

test('a selected area is named after the stop its routes actually use', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  const state = await page.evaluate(async () => {
    const nodes = await (await fetch('data/nodes.json')).json();
    const index = name => nodes.names.findIndex((value, i) => value === name && nodes.kind[i] === 1);
    const origin = name => {
      const node = index(name);
      return { kind: 'node', node, label: nodes.names[node], lat: nodes.lat[node], lon: nodes.lon[node] };
    };
    return {
      v: 1,
      people: [
        { id: 'p1', name: 'Alex', origin: origin('Central'), walkMinutes: 20 },
        { id: 'p2', name: 'Sam', origin: origin('Sha Tin'), walkMinutes: 20 },
      ],
      settings: { modes: ['rail', 'bus'], tolerance: 0.1, includeHeadway: true },
      locale: 'en',
      selected: { kind: 'result', index: 0 },
    };
  });
  await page.goto(await makeShareUrl(page, state));
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  await expect.poll(() => page.locator('.result-row').count()).toBeGreaterThan(0);
  await page.locator('.result-row').first().click();
  await page.locator('#betaBadge').click();

  const downloadPromise = page.waitForEvent('download');
  await page.locator('#exportDiagnostics').click();
  const download = await downloadPromise;
  const dump = JSON.parse(readFileSync(await download.path(), 'utf8'));
  const area = dump.selectedArea;
  expect(area).toBeTruthy();
  const stops = area.routes.flatMap(route => route.legs.flatMap(leg => [leg.fromStop, leg.toStop]));
  expect(stops).toContain(area.label);
});
