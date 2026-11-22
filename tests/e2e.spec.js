const { test, expect } = require('@playwright/test');

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
  await expect(page.locator('#netstatus')).toHaveText('network ready');
});

test('map renders a keyless vector canvas with no API-key errors', async ({ page }) => {
  const blocked = [];
  const raster = [];
  page.on('request', req => {
    if (/cartocdn|fonts\.googleapis|unpkg\.com|jsdelivr/.test(req.url())) blocked.push(req.url());
    if (/tile\.openstreetmap\.org/.test(req.url())) raster.push(req.url());
  });
  await page.reload();
  await expect(page.locator('#netstatus')).toHaveText('network ready');
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
  await expect(page.locator('body')).not.toContainText('API KEY');
  expect(blocked).toEqual([]);
  expect(raster).toEqual([]);
});

test('clean basemap has no raster tile layer or symbol labels', async ({ page }) => {
  const source = await page.evaluate(async () => (await (await fetch('app.js')).text()));
  expect(source).not.toContain('tile.openstreetmap.org');
  expect(source).not.toContain("type:'symbol'");
  expect(source).toContain('tiles.openfreemap.org/planet');
});

test('defaults load and a two-person search produces ranked results', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  await expect(page.locator('.card')).toHaveCount(2);
  await expect(page.locator('.name-input').nth(0)).toHaveValue('Person A');
  await expect(page.locator('.name-input').nth(1)).toHaveValue('Person B');
  await expect(page.locator('.start-input').nth(0)).toHaveValue('Tsuen Wan');
  await expect(page.locator('.start-input').nth(1)).toHaveValue('North Point');
  await expect(page.locator('#resultsList')).toBeHidden();
  await expect(page.locator('#resultState .empty-state')).toBeVisible();

  await page.locator('#go').click();
  await expect(page.locator('#resultsList')).toBeVisible();
  await expect(page.locator('.result')).toHaveCount(7);
  await expect(page.locator('.result.active .rank')).toHaveText('01');
  await expect(page.locator('.result.active .title span').first()).not.toBeEmpty();
  await expect(page.locator('#detail')).toBeVisible();
  await expect(page.locator('#steps .step')).toHaveCount(2);
  await expect(page.locator('.step').first()).toContainText('Person A');
  await expect(page.locator('#steps .dot').first()).toHaveText('PA');
  await expect(page.locator('#steps .dot').nth(1)).toHaveText('PB');
  await expect(page.locator('.result.active .barrow .who').first()).toHaveText('PA');
  await expect(page.locator('.result.active .barrow .who').nth(1)).toHaveText('PB');
  await expect(page.locator('body')).not.toContainText('★');
  await expect(page.locator('body')).not.toContainText('—');
  expect(errors).toEqual([]);
});

test('results show district subtitles and routes are segmented by mode', async ({ page }) => {
  await page.locator('#go').click();
  await expect(page.locator('.result')).toHaveCount(7);
  await expect(page.locator('.result').first().locator('.result-foot .district')).not.toBeEmpty();
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
  await expect.poll(() => page.locator('#steps .leg.route-walk').count()).toBeGreaterThan(0);
  await expect.poll(() => page.locator('#steps .leg.route-bus').count()).toBeGreaterThan(0);
});

test('results list supports arrow and home keys', async ({ page }) => {
  await page.locator('#go').click();
  const first = page.locator('.result').first();
  await first.focus();
  await first.press('ArrowDown');
  await expect(page.locator('.result').nth(1)).toHaveClass(/active/);
  await page.locator('.result').nth(1).press('End');
  await expect(page.locator('.result').last()).toHaveClass(/active/);
  await page.locator('.result').last().press('Home');
  await expect(first).toHaveClass(/active/);
  await expect(first).toBeFocused();
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
  await expect(third.locator('.hint')).toHaveText('Address saved');
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

test('move controls reorder people and recenter never changes an origin', async ({ page }) => {
  await expect(page.locator('.card').first().locator('.move.up')).toBeDisabled();
  await expect(page.locator('.card').last().locator('.move.down')).toBeDisabled();
  await page.locator('.card').nth(1).locator('.move.up').click();
  await expect(page.locator('.name-input').first()).toHaveValue('Person B');
  await expect(page.locator('.name-input').nth(1)).toHaveValue('Person A');
  await expect(page.locator('.card .centre')).toHaveCount(0);

  const before = await page.locator('.start-input').first().inputValue();
  await page.locator('#recenter').click();
  await expect(page.locator('.start-input').first()).toHaveValue(before);
  await expect(page.locator('.hint').first()).not.toHaveText('Map pin saved');
});

test('scenario removal works down to one and card controls are icon-only', async ({ page }) => {
  const card = page.locator('.card').first();
  await expect(card.locator('.remove')).toBeVisible();
  await expect(card.locator('.remove')).toHaveAttribute('title', 'Remove person A');
  await expect(card.locator('.remove')).toHaveAttribute('data-tooltip', 'Remove person A');
  await expect(card.locator('.drag-handle')).toHaveCount(0);
  await expect(card.locator('.centre')).toHaveCount(0);

  for (const selector of ['.save-person', '.remove', '.pin', '.move.up', '.move.down']) {
    await expect(card.locator(selector)).toHaveText('');
  }

  await card.locator('.remove').click();
  await expect(page.locator('.card')).toHaveCount(1);
  await expect(page.locator('.remove')).toBeHidden();
  await page.locator('#go').click();
  await expect(page.locator('#error')).toHaveText('Add at least two people with a start place.');
});

test('results sit on the left and parameters and people sit on the right', async ({ page }) => {
  await expect(page.locator('.side-left #resultsList')).toHaveCount(1);
  await expect(page.locator('.side-left #resultState')).toBeVisible();
  await expect(page.locator('.side-right #go')).toBeVisible();
  await expect(page.locator('.side-right #tolerance')).toBeVisible();
  await expect(page.locator('.side-right #budget')).toBeVisible();
  await expect(page.locator('.side-right #reset')).toBeVisible();
  await expect(page.locator('.side-right .card')).toHaveCount(2);
  await expect(page.locator('header #library')).toBeVisible();
  await expect(page.locator('.main #map')).toBeVisible();
});

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

test('search results draw a discrete heatmap instead of a gradient', async ({ page }) => {
  await page.locator('#go').click();
  await expect(page.locator('.result')).toHaveCount(7);
  await expect.poll(() => page.locator('path.heat-cell').count()).toBeGreaterThan(0);
  const fills = await page.locator('path.heat-cell').evaluateAll(els => [...new Set(els.map(el => el.getAttribute('fill')))]);
  const allowed = ['#064E3B', '#047857', '#059669', '#10B981', '#34D399', '#6EE7B7'];
  expect(fills.length).toBeGreaterThan(0);
  expect(fills.every(fill => allowed.includes(fill))).toBe(true);
  await expect(page.locator('.legend .swatch.h1')).toBeVisible();
  await expect(page.locator('.legend .swatch.h6')).toBeVisible();
});

test('named people, Photon addresses, tolerance cloud and budget work', async ({ page }) => {
  await page.locator('.card').nth(0).locator('.name-input').fill('Alex');
  await page.locator('.card').nth(1).locator('.name-input').fill('Sam');
  await page.locator('#add').click();

  const third = page.locator('.card').nth(2);
  await third.locator('.name-input').fill('Riley');
  await third.locator('.start-input').fill('3 Canton Road');
  await third.locator('.suggestion').first().click();
  await expect(third.locator('.start-input')).toHaveValue('Harbour City, 3 Canton Road, Hong Kong');
  await expect(third.locator('.hint')).toHaveText('Address saved');
  await expect(page.locator('#count')).toHaveText('3');

  await setRange(page, '#tolerance', '0.2');
  await setRange(page, '#budget', '90');
  await expect(page.locator('#tolval')).toHaveText('20%');
  await expect(page.locator('#budgetval')).toHaveText('90 min');

  await page.locator('#go').click();
  await expect(page.locator('.result')).toHaveCount(7);
  await expect(page.locator('.result').first().locator('.barrow')).toHaveCount(3);
  await expect(page.locator('#steps .step')).toHaveCount(3);
  await expect(page.locator('.step').first()).toContainText('Alex');
  await expect(page.locator('.step').nth(2)).toContainText('Riley');
  await expect.poll(() => page.locator('.leaflet-overlay-pane path').count()).toBeGreaterThan(0);
  await expect(page.locator('#nres')).toContainText('areas');
  await expect(page.locator('#goLabel')).toHaveText('Find fair areas');
});

test('settings, people, library and locale persist, and reset restores defaults', async ({ page }) => {
  await page.locator('.card').nth(0).locator('.name-input').fill('Alex');
  await page.locator('.chip[data-mode="bus"]').click();
  await setRange(page, '#tolerance', '0.25');
  await setRange(page, '#budget', '75');
  await page.locator('.card').first().locator('.save-person').click();
  await page.locator('#locale').selectOption('zh-Hant');
  await expect.poll(() => page.locator('html').getAttribute('lang')).toBe('zh-Hant');

  const stored = await page.evaluate(() => ({
    people: localStorage.getItem('hkfair.v2.people'),
    settings: localStorage.getItem('hkfair.v2.settings'),
    directory: localStorage.getItem('hkfair.v2.directory'),
    locale: localStorage.getItem('hkfair.v2.locale'),
  }));
  expect(stored.people).toContain('Alex');
  expect(stored.settings).toContain('"tolerance":0.25');
  expect(stored.settings).toContain('"budget":75');
  expect(stored.directory).toContain('Alex');
  expect(stored.locale).toBe('zh-Hant');

  await page.reload();
  await expect.poll(() => page.locator('html').getAttribute('lang')).toBe('zh-Hant');
  await expect(page.locator('#netstatus')).toHaveText('時刻表就緒');
  await expect(page.locator('.name-input').first()).toHaveValue('Alex');
  await expect(page.locator('.chip[data-mode="rail"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.chip[data-mode="bus"]')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#tolerance')).toHaveValue('0.25');
  await expect(page.locator('#budget')).toHaveValue('75');

  await page.locator('#locale').selectOption('en');
  await expect.poll(() => page.locator('html').getAttribute('lang')).toBe('en');
  await page.locator('#reset').click();
  await page.waitForLoadState('domcontentloaded');
  await expect(page.locator('.card')).toHaveCount(2);
  await expect(page.locator('.name-input').first()).toHaveValue('Person A');
  await expect(page.locator('#tolerance')).toHaveValue('0.1');
  await expect(page.locator('#budget')).toHaveValue('60');
});

test('locale switching translates static text and enables RTL layout', async ({ page }) => {
  const traditional = await catalog(page, 'zh-Hant');
  const urdu = await catalog(page, 'ur');
  await page.locator('#go').click();
  const englishDistrict = await page.locator('#detailDistrict').textContent();
  const englishCount = await page.locator('#nres').textContent();

  await page.locator('#locale').selectOption('zh-Hant');
  await expect.poll(() => page.locator('html').getAttribute('lang')).toBe('zh-Hant');
  await expect(page.locator('h1')).toHaveText(traditional['app.title']);
  await expect(page.locator('#goLabel')).toHaveText(traditional['options.search']);
  await expect(page.locator('#resultsList')).toHaveAttribute('aria-label', traditional['results.title']);
  await expect(page.locator('[data-i18n="results.title"]')).toHaveText(traditional['results.title']);
  await expect.poll(() => page.locator('#nres').textContent()).not.toBe(englishCount);
  await expect(page.locator('#nres')).toContainText('顯示');
  await expect.poll(() => page.locator('#detailDistrict').textContent()).not.toBe(englishDistrict);

  await page.locator('#add').click();
  await page.locator('#locale').selectOption('ur');
  await expect.poll(() => page.locator('html').getAttribute('dir')).toBe('rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ur');
  await expect(page.locator('#goLabel')).toHaveText(urdu['options.search']);
  await page.locator('#go').click();
  await expect(page.locator('#error')).toHaveText(urdu['error.missingOrigins']);
});

test('rejects an unset origin with an inline error', async ({ page }) => {
  await page.locator('#add').click();
  await page.locator('#go').click();
  await expect(page.locator('#error')).toBeVisible();
  await expect(page.locator('#error')).toHaveText('Choose a start place for every person.');
  await expect(page.locator('#resultsList')).toBeHidden();
  await expect(page.locator('#resultState .empty-state')).toBeVisible();
});

test('tight tolerance and budget produce an empty result set', async ({ page }) => {
  await setRange(page, '#tolerance', '0');
  await setRange(page, '#budget', '15');
  await page.locator('#go').click();
  await expect(page.locator('.result')).toHaveCount(0);
  await expect(page.locator('#resultState .empty-state')).toHaveText('No places fit this tolerance and budget. Increase either setting.');
  await expect(page.locator('#nres')).toContainText('0 areas');
  await expect(page.locator('#error')).toBeHidden();
});

test('map pin fallback saves a coordinate origin', async ({ page }) => {
  await page.locator('.card').nth(0).locator('.pin').click();
  await expect(page.locator('#map')).toHaveClass(/pinning/);
  await expect(page.locator('#pinBanner')).toBeVisible();
  await page.locator('#map').click({ position: { x: 320, y: 220 } });
  await expect(page.locator('#map')).not.toHaveClass(/pinning/);
  await expect(page.locator('#pinBanner')).toBeHidden();
  await expect(page.locator('.start-input').first()).toHaveValue(/^Pin /);
  await expect(page.locator('.hint').first()).toHaveText('Map pin saved');

  await page.locator('#go').click();
  await expect(page.locator('.result')).toHaveCount(7);
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
  await expect(page.locator('#netstatus')).toHaveText('network ready');
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
  for (const selector of ['#add', '#library', '#go', '#recenter', '#share', '#reset', '#emptyRun']) {
    await expect(page.locator(`${selector} .icon`)).toBeVisible();
    await expect(page.locator(selector)).toHaveAttribute('data-tooltip', /.+/);
    await expect(page.locator(selector)).toHaveAttribute('aria-label', /.+/);
  }
  for (const mode of ['rail', 'bus']) {
    const chip = page.locator(`.chip[data-mode="${mode}"]`);
    await expect(chip.locator('.icon')).toBeVisible();
    await expect(chip).toHaveAttribute('data-tooltip', /.+/);
  }
  await expect(page.locator('#recenter .icon-scan')).toBeVisible();
  await expect(page.locator('.legend-head .icon-scan')).toBeVisible();
  await expect(page.locator('.legend')).toBeVisible();
  await expect(page.locator('.legend')).toHaveCSS('z-index', '900');
  await expect(page.locator('#betaVectors')).toBeAttached();
  await expect(page.locator('#vectorSection')).toBeHidden();
  await expect(page.locator('#legendVectorKey')).toBeHidden();
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
  await page.locator('#library').click();
  const actionText = await page.locator('.directory-actions button').evaluateAll(els => els.map(el => el.textContent.trim()));
  expect(actionText.every(text => text === '')).toBe(true);
  await expect(page.locator('.directory-actions button .icon').first()).toBeVisible();
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

test('beta interest vectors default off and auto recompute with labelled preferences', async ({ page }) => {
  await expect(page.locator('#vectorSection')).toBeHidden();
  await expect(page.locator('#legendVectorKey')).toBeHidden();
  await Promise.all([
    page.waitForResponse(response => response.url().includes('poi-index.json')),
    page.locator('#betaVectors').check(),
  ]);
  await expect(page.locator('#vectorSection')).toBeVisible();
  await expect(page.locator('#legendVectorKey')).toBeVisible();
  for (const key of ['food', 'drinks', 'activities', 'culture', 'outdoors', 'shopping']) {
    await expect(page.locator(`#vec-${key}`)).toHaveValue('0');
    await expect(page.locator(`#vec-${key}-val`)).toHaveText('Off');
    await expect(page.locator(`.vector-row:has(#vec-${key}) .icon`)).toBeVisible();
  }
  await expect(page.locator('.vector-help')).toContainText('ranked mainly by travel time');
  await page.locator('#go').click();
  await expect(page.locator('.result').first().locator('.fit-row')).toBeVisible();
  await expect(page.locator('.result').first().locator('.fit-bar')).toHaveCount(6);
  await expect(page.locator('#detailSub')).toContainText('No preference applied');

  const before = await page.locator('#nres').textContent();
  await setRange(page, '#vec-food', '3');
  await expect(page.locator('#vec-food-val')).toHaveText('Prefer 3');
  await expect(page.locator('#detailSub')).toContainText('Preference raises rank');
  await expect.poll(async () => page.locator('#nres').textContent()).not.toBe(before);
  const settings = await page.evaluate(() => localStorage.getItem('hkfair.v2.settings'));
  expect(settings).toContain('"food":3');
  expect(settings).toContain('"beta":{"vectors":true}');

  await setRange(page, '#vec-food', '-3');
  await expect(page.locator('#vec-food-val')).toHaveText('Avoid 3');
  const avoided = await page.evaluate(() => localStorage.getItem('hkfair.v2.settings'));
  expect(avoided).toContain('"food":-3');

  await page.locator('#betaVectors').uncheck();
  await expect(page.locator('#vectorSection')).toBeHidden();
  await expect(page.locator('#legendVectorKey')).toBeHidden();
  await expect(page.locator('.result').first().locator('.fit-row')).toHaveCount(0);
  await expect.poll(() => page.locator('#detailSub').textContent()).not.toContain('preference');
});

test('heat cells reveal delayed interest tooltips and open a breakdown', async ({ page }) => {
  await page.locator('#go').click();
  await expect.poll(() => page.locator('path.heat-cell').count()).toBeGreaterThan(0);
  await page.waitForTimeout(500);
  const point = await page.locator('path.heat-cell').evaluateAll(elements => {
    const candidates = elements.map(el => el.getBoundingClientRect())
      .filter(rect => rect.width > 8 && rect.height > 8 && rect.x > 300 && rect.y > 150 && rect.x < 900 && rect.y < 550)
      .map(rect => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }));
    return candidates.find(candidate => document.elementFromPoint(candidate.x, candidate.y)?.classList.contains('heat-cell')) || null;
  });
  expect(point).not.toBeNull();
  await page.mouse.move(point.x, point.y);
  await expect(page.locator('#mapTooltip')).toBeVisible({ timeout: 2500 });
  await expect(page.locator('#mapTooltip .tooltip-vector')).toHaveCount(0);
  await expect(page.locator('#mapTooltip')).not.toContainText('Area interest fit');
  await page.mouse.click(point.x, point.y);
  await expect(page.locator('#detail')).toBeVisible();
  await expect(page.locator('#detailTitle')).not.toBeEmpty();
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
  await setRange(page, '#budget', '75');
  await page.locator('#go').click();
  await page.locator('#share').click();
  await expect(page.locator('#share')).toHaveAttribute('data-tooltip', 'Share link copied');
  const sharedUrl = await page.evaluate(() => window.__copied);
  expect(sharedUrl).toContain('#s=');
  await page.goto(sharedUrl);
  await expect(page.locator('.name-input').first()).toHaveValue('Alex');
  await expect(page.locator('#budget')).toHaveValue('75');
});

test('mobile layout keeps the legend and interest key visible', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.legend')).toBeVisible();
  await expect(page.locator('.legend-head')).toBeVisible();
  await expect(page.locator('.legend .vector-key')).toBeHidden();
  await expect(page.locator('.legend .pin-key')).toBeVisible();
  await expect(page.locator('.legend .recenter-key')).toBeVisible();
  await expect(page.locator('.legend .cloud-key')).toBeVisible();
});
