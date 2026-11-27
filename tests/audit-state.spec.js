const { test, expect } = require('@playwright/test');

async function preparePage(page) {
  await page.route('**/sw.js', route => route.abort());
  await page.route('**/tiles.openfreemap.org/**', route => route.abort());
  await page.route('**/basemaps.cartocdn.com/**', route => route.abort());
  await page.route('**/photon.komoot.io/api/**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ features: [] }),
  }));
}

async function directoryIds(page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('hkfair.v2.directory');
    return raw === null ? null : JSON.parse(raw).map(profile => profile.id);
  });
}

async function nameValues(page) {
  return page.locator('.name-input').evaluateAll(inputs => inputs.map(input => input.value));
}

async function catalog(page, locale) {
  return page.evaluate(async code => {
    const response = await fetch(`i18n/${code}.json`);
    if (!response.ok) throw new Error(`Missing catalogue ${code}`);
    return response.json();
  }, locale);
}

async function makeShareUrl(page, state) {
  return page.evaluate(value => {
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    let binary = '';
    bytes.forEach(byte => { binary += String.fromCharCode(byte); });
    const encoded = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `${location.origin}${location.pathname}#s=${encoded}`;
  }, state);
}

async function sharedScenario(page, { locale, selected, tolerance, origins = ['Tsuen Wan', 'North Point'], includeHeadway = false }) {
  return page.evaluate(async options => {
    const nodes = await (await fetch('data/nodes.json')).json();
    const index = name => nodes.names.findIndex((value, i) => value === name && nodes.kind[i] === 1);
    const origin = name => {
      const node = index(name);
      return { kind: 'node', node, label: nodes.names[node], lat: nodes.lat[node], lon: nodes.lon[node] };
    };
    const names = ['Alex', 'Sam', 'Riley', 'Mia', 'Noah', 'Zoe', 'Eli', 'Ava'];
    return {
      v: 1,
      people: options.origins.map((name, i) => ({
        id: `p${i + 1}`,
        name: names[i] || `Person ${i + 1}`,
        origin: origin(name),
        walkMinutes: 20,
      })),
      settings: { modes: ['rail'], tolerance: options.tolerance, includeHeadway: options.includeHeadway },
      locale: options.locale,
      selected: options.selected,
    };
  }, { locale, selected, tolerance, origins, includeHeadway });
}

test.beforeEach(async ({ page }) => {
  await preparePage(page);
});

test('blocked nodes.json leaves a visible error and a usable shell', async ({ page }) => {
  await page.route('**/data/nodes.json', route => route.abort());
  await page.goto('/');

  await expect(page.locator('html')).toHaveAttribute('data-net', 'error');
  await expect(page.locator('#error')).toBeVisible();
  await expect(page.locator('#error')).toContainText(/Nodes|search failed/i);
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.locator('#map')).toBeVisible();
  await expect(page.locator('#go')).toBeVisible();
  await expect(page.locator('#resultsList')).toBeAttached();
  await expect(page.locator('#cards')).toBeAttached();
});

test('a throwing localStorage.setItem does not blank the app', async ({ page, context }) => {
  // Injected into this test's context only, never into the shared page. Keep a
  // restorer so the prototype is put back even if an assertion fails.
  await context.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function () {
      throw new Error('storage disabled');
    };
    Object.defineProperty(window, '__restoreSetItem', {
      value: () => { Storage.prototype.setItem = original; },
    });
  });
  try {
    await page.goto('/');

    await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
    await expect(page.locator('#error')).toBeHidden();
    await expect(page.locator('.card')).toHaveCount(2);
    await expect(page.locator('#go')).toBeVisible();

    await page.locator('#go').click();
    await expect.poll(() => page.locator('.result-row').count()).toBeGreaterThan(0);
  } finally {
    await page.evaluate(() => window.__restoreSetItem?.()).catch(() => {});
  }
});

test('saved people keep increasing ids across reloads', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');

  await page.locator('.card').nth(0).locator('.save-person').click();
  await page.locator('.card').nth(1).locator('.save-person').click();
  expect(await directoryIds(page)).toEqual(['d1', 'd2']);

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  await page.locator('#add').click();
  const third = page.locator('.card').nth(2);
  await third.locator('.start-input').fill('Tsuen Wan');
  await expect(third.locator('.suggestion').filter({ hasText: 'Tsuen Wan' }).first()).toBeVisible();
  await third.locator('.suggestion').filter({ hasText: 'Tsuen Wan' }).first().click();
  await third.locator('.save-person').click();

  expect(await directoryIds(page)).toEqual(['d1', 'd2', 'd3']);
});

test('a deliberately empty directory stays empty across reloads', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  await page.locator('.card').first().locator('.save-person').click();

  await page.locator('#library').click();
  for (const id of await directoryIds(page)) {
    const row = page.locator(`.directory-row[data-id="${id}"]`);
    await row.locator('[data-action="delete"]').click();
    await row.locator('[data-action="delete"]').click();
    await expect(row).toHaveCount(0);
  }
  await expect(page.locator('.directory-row')).toHaveCount(0);
  expect(await directoryIds(page)).toEqual([]);
  await page.locator('#libraryClose').click();

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  expect(await directoryIds(page)).toEqual([]);
  await page.locator('#library').click();
  await expect(page.locator('.directory-row')).toHaveCount(0);
  await expect(page.locator('.directory-empty')).toBeVisible();
});

test('a shared result selection survives hash cleanup and reload', async ({ page }) => {
  await page.goto('/');
  const state = await sharedScenario(page, {
    locale: 'zh-Hant',
    tolerance: 0.15,
    selected: { kind: 'result', index: 0 },
  });
  const url = await makeShareUrl(page, state);
  // A hash-only navigation is same-document in browsers, so force a full load.
  await page.goto(url);
  await page.reload();

  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hant');
  expect(new URL(page.url()).hash).toBe('');
  await expect(page.locator('#error')).toBeHidden();
  expect(await nameValues(page)).toEqual(['Alex', 'Sam']);
  await expect(page.locator('#tolval')).toHaveText('15%');
  await expect(page.locator('.chip[data-mode="rail"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.chip[data-mode="bus"]')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#includeHeadway')).not.toBeChecked();

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hant');
  expect(await nameValues(page)).toEqual(['Alex', 'Sam']);
  await expect(page.locator('#tolval')).toHaveText('15%');
  await expect(page.locator('#includeHeadway')).not.toBeChecked();

  await page.locator('#go').click();
  await expect.poll(() => page.locator('.result-row').count()).toBeGreaterThan(0);
  await expect(page.locator('.result-row.selected')).toHaveCount(1);
  await expect(page.locator('.result-row.selected')).toHaveAttribute('data-index', '0');
  await expect(page.locator('#detail')).toBeVisible();
});

test('a shared pinned point survives reload', async ({ page }) => {
  await page.goto('/');
  const point = await page.evaluate(async () => {
    const nodes = await (await fetch('data/nodes.json')).json();
    const index = nodes.names.findIndex((name, i) => name === 'Tsuen Wan' && nodes.kind[i] === 1);
    return { lat: nodes.lat[index], lon: nodes.lon[index], node: index };
  });
  const state = await sharedScenario(page, {
    locale: 'en',
    tolerance: 3.05,
    selected: { kind: 'point', ...point },
  });
  const url = await makeShareUrl(page, state);
  await page.goto(url);

  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  // A share link with a selection re-runs the search on arrival and consumes
  // its fragment, so the recipient lands at the pinned point immediately.
  await expect.poll(() => page.locator('.result-row').count()).toBeGreaterThan(0);
  await expect(page.locator('#pointBanner')).toBeVisible();
  await expect(page.locator('#detailTitle')).toHaveText('Pinned point');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  // After the hash is consumed the results are gone again; the banner waits
  // for a search, while the persisted selection and tolerance remain.
  await expect(page.locator('#pointBanner')).toBeHidden();
  await expect(page.locator('#tolval')).toHaveText('Unlimited');

  await page.locator('#go').click();
  await expect.poll(() => page.locator('.result-row').count()).toBeGreaterThan(0);
  await expect(page.locator('#pointBanner')).toBeVisible();
  await expect(page.locator('#detailTitle')).toHaveText('Pinned point');
  await expect(page.locator('.point-pin')).toHaveCount(1);
});

test('a pinned point shows the MTR route to Yuen Long', async ({ page }) => {
  await page.goto('/');
  const point = await page.evaluate(async () => {
    const nodes = await (await fetch('data/nodes.json')).json();
    const index = nodes.names.findIndex((name, i) => name === 'Yuen Long' && nodes.kind[i] === 1);
    return { lat: nodes.lat[index], lon: nodes.lon[index], node: index };
  });
  const state = await sharedScenario(page, {
    locale: 'en',
    tolerance: 3.05,
    origins: ['North Point', 'Chai Wan'],
    includeHeadway: true,
    selected: { kind: 'point', ...point },
  });
  const url = await makeShareUrl(page, state);
  await page.goto(url);

  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  await expect.poll(() => page.locator('.result-row').count()).toBeGreaterThan(0);
  await expect(page.locator('#error')).toBeHidden();
  await expect(page.locator('#pointBanner')).toBeVisible();
  await expect(page.locator('#detailTitle')).toHaveText('Pinned point');
  await expect(page.locator('#steps')).toContainText('Tuen Ma Line');
  await expect(page.locator('#steps')).toContainText('Yuen Long');
});

test('an out-of-reach pinned point shows a map notice', async ({ page }) => {
  await page.goto('/');
  const state = await sharedScenario(page, {
    locale: 'en',
    tolerance: 3.05,
    origins: ['North Point', 'Chai Wan'],
    includeHeadway: true,
    selected: { kind: 'point', lat: 22.20, lon: 114.40 },
  });
  const url = await makeShareUrl(page, state);
  await page.goto(url);

  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  await expect.poll(() => page.locator('.result-row').count()).toBeGreaterThan(0);
  await expect(page.locator('#pointNotice')).toBeVisible();
  await expect(page.locator('#pointNoticeText')).toHaveText('That point cannot be reached by everyone within 150 minutes.');
  await expect(page.locator('#pointBanner')).toBeHidden();
  await expect(page.locator('#error')).toBeHidden();
  await page.locator('#dismissPointNotice').click();
  await expect(page.locator('#pointNotice')).toBeHidden();
});

test('default names are placeholders that follow the locale', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  await page.locator('#go').click();
  await expect.poll(() => page.locator('#steps .step').count()).toBeGreaterThan(0);
  await expect.poll(() => page.locator('#steps .step b').allInnerTexts()).toEqual(['Person A', 'Person B']);

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('hkfair.v2.people')));
  expect(stored.map(person => person.name)).toEqual(['', '']);

  const traditional = await catalog(page, 'zh-Hant');
  await page.locator('#locale').selectOption('zh-Hant');
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hant');
  const expected = ['A', 'B'].map(letter => traditional['people.defaultName'].replace('{letter}', letter));
  await expect.poll(() => page.locator('#steps .step b').allInnerTexts()).toEqual(expected);

  await page.locator('#locale').selectOption('en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect.poll(() => page.locator('#steps .step b').allInnerTexts()).toEqual(['Person A', 'Person B']);
});
