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
  for (const key of ['results.preferenceUp', 'results.preferenceDown', 'results.preferenceNone']) {
    expect(en).not.toHaveProperty(key);
  }

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
  for (const stale of ['Tap a red area', 'prefer includes, avoid discounts', 'starts stay put', 'Preferences can make nearby interests count']) {
    expect(html, `stale fallback copy "${stale}"`).not.toContain(stale);
  }
});

test('every no-JavaScript fallback in index.html matches the English catalogue', async ({ page }) => {
  const html = readFileSync('src/index.html', 'utf8');
  const en = JSON.parse(readFileSync('static/i18n/en.json', 'utf8'));
  // Reviewed exceptions: these no-JS labels are deliberately shorter than the
  // full translated tooltip/aria text and are not stale translations.
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

  expect(fallbacks.length, 'index.html must expose literal fallbacks').toBeGreaterThan(100);
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
