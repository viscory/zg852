const { test, expect } = require('@playwright/test');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const EN_CATALOGUE = JSON.parse(readFileSync(join(__dirname, '..', 'static', 'i18n', 'en.json'), 'utf8'));

test.use({ serviceWorkers: 'block' });

test.beforeEach(async ({ page }) => {
  await page.route('**/sw.js', route => route.abort());
  await page.route('**/tiles.openfreemap.org/**', route => route.abort());
  await page.route('**/photon.komoot.io/api/**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ features: [] }),
  }));
});

async function nodeOrigin(page, name) {
  const response = await page.request.get('/data/nodes.json');
  const nodes = await response.json();
  let index = nodes.names.findIndex((value, i) => value === name && nodes.kind[i] === 1);
  if (index < 0) index = nodes.names.findIndex(value => value === name);
  if (index < 0) throw new Error(`Node not found: ${name}`);
  return {
    kind: 'node', node: index, label: nodes.names[index],
    lat: nodes.lat[index], lon: nodes.lon[index],
    district: nodes.districts?.[index] || null,
  };
}

async function shareUrl(page, state) {
  return page.evaluate(value => {
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    let binary = '';
    bytes.forEach(byte => { binary += String.fromCharCode(byte); });
    const encoded = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `${location.origin}${location.pathname}#s=${encoded}`;
  }, state);
}

const settings = { modes: ['rail', 'bus'], fairness: 'time', tolerance: 0.25, includeHeadway: true };

test('displayed spread equals the difference of the displayed total minutes', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  await page.locator('#go').click();
  await expect.poll(() => page.locator('.result-row').count()).toBeGreaterThan(0);
  await page.locator('.result-row[data-index="0"]').click();
  const detail = await page.locator('#detailSub').innerText();
  const spread = Number(detail.match(/Spread\s+(\d+)/)?.[1]);
  const totals = (await page.locator('.step .route-meta .muted').allInnerTexts())
    .map(text => Number(text.match(/(\d+)/)?.[1]));
  expect(totals.length).toBeGreaterThan(1);
  expect(totals.every(Number.isFinite)).toBe(true);
  expect(spread).toBe(Math.max(...totals) - Math.min(...totals));
});

test('two cells with the same minute label always share one colour', async ({ page }) => {
  await page.goto('/');
  await page.locator('#go').click();
  await expect.poll(() => page.locator('path.heat-cell').count()).toBeGreaterThan(0);
  const groups = await page.locator('path.heat-cell').evaluateAll(elements => {
    const byMinute = {};
    for (const element of elements) {
      const minute = element.getAttribute('aria-label')?.match(/:\s*(\d+)\s*min/)?.[1];
      if (!minute) continue;
      (byMinute[minute] ||= new Set()).add(element.getAttribute('fill'));
    }
    return Object.entries(byMinute).map(([minute, fills]) => [minute, [...fills]]);
  });
  expect(groups.length).toBeGreaterThan(0);
  for (const [minute, fills] of groups) expect(fills, `${minute} min`).toHaveLength(1);
});

test('the count discloses the sort order and fare mode reports a fare spread', async ({ page }) => {
  await page.goto('/');
  await page.locator('#go').click();
  await expect.poll(() => page.locator('.result-row').count()).toBeGreaterThan(0);
  const rows = await page.locator('.result-row').count();
  await expect(page.locator('#nres')).toHaveText(EN_CATALOGUE['results.header'].replace('{count}', String(rows)));
  await page.locator('#fairnessToggle [data-fairness="fare"]').click();
  await expect.poll(() => page.locator('.result-row').count()).toBeGreaterThan(0);
  await expect(page.locator('.result-row').first().locator('.result-times > span').first())
    .toContainText('Fare spread HK$');
});

test('tapping the last active transport mode explains why it stays on', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  await page.locator('.chip[data-mode="rail"]').click();
  await expect(page.locator('.chip[data-mode="rail"]')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('.chip[data-mode="bus"]').click();
  await expect(page.locator('#error')).toHaveText(EN_CATALOGUE['error.noMode']);
  await expect(page.locator('.chip[data-mode="bus"]')).toHaveAttribute('aria-pressed', 'true');
});

test('a share hash added in place restores the scenario', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  const [tsuenWan, northPoint] = await Promise.all([
    nodeOrigin(page, 'Tsuen Wan'), nodeOrigin(page, 'North Point'),
  ]);
  const url = await shareUrl(page, {
    v: 1,
    people: [
      { id: 'p1', name: 'Shared A', origin: tsuenWan, walkMinutes: 20 },
      { id: 'p2', name: 'Shared B', origin: northPoint, walkMinutes: 20 },
    ],
    settings,
    locale: 'en',
  });
  await page.evaluate(hash => { location.hash = hash; }, url.slice(url.indexOf('#')));
  await expect(page.locator('.name-input').first()).toHaveValue('Shared A');
  await expect(page.locator('.name-input').nth(1)).toHaveValue('Shared B');
});

test('a pinned start label follows the selected language', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  const northPoint = await nodeOrigin(page, 'North Point');
  const url = await shareUrl(page, {
    v: 1,
    people: [
      {
        id: 'p1', name: 'A', walkMinutes: 20,
        origin: {
          kind: 'coords', source: 'pin', label: 'Pinned point · Sham Shui Po',
          lat: 22.33016, lon: 114.16253, district: 'Sham Shui Po',
        },
      },
      { id: 'p2', name: 'B', origin: northPoint, walkMinutes: 20 },
    ],
    settings,
    locale: 'en',
  });
  await page.goto(url);
  await expect(page.locator('.start-input').first()).toHaveValue('Pinned point · Sham Shui Po');
  await page.locator('#locale').selectOption('de');
  await expect(page.locator('.start-input').first()).toHaveValue('Fixierter Punkt · Sham Shui Po');
});

test('a failed search shows the real error instead of the pre-search prompt', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  const [ferry, northPoint] = await Promise.all([
    nodeOrigin(page, 'Cheung Chau Ferry Pier at San Hing Praya Street'), nodeOrigin(page, 'North Point'),
  ]);
  const url = await shareUrl(page, {
    v: 1,
    people: [
      { id: 'p1', name: 'A', origin: ferry, walkMinutes: 20 },
      { id: 'p2', name: 'B', origin: northPoint, walkMinutes: 20 },
    ],
    settings,
    selected: { kind: 'result', index: 0 },
    locale: 'en',
  });
  await page.goto(url);
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  await page.locator('#go').click();
  await expect(page.locator('#error')).toContainText(/cannot reach|no area is reachable/);
  await expect(page.locator('#resultState')).toBeHidden();
});

test('Unlimited shows the ranked areas and still picks any point under them', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  await page.locator('#tolerance').evaluate(el => {
    el.value = String(el.max);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(page.locator('#tolval')).toHaveText('Unlimited');
  await page.locator('#go').click();
  await expect.poll(() => page.locator('.result-row').count()).toBeGreaterThan(1);
  await expect.poll(() => page.locator('path.heat-cell').count()).toBeGreaterThan(0);
  await expect(page.locator('path.heat-cell').first()).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('path.heat-cell[tabindex]')).toHaveCount(0);

  // A click on top of a shaded cell must pick a free point, not the cell.
  const target = await page.locator('path.heat-cell').evaluateAll(cells => {
    const map = document.getElementById('map');
    for (const cell of cells) {
      const box = cell.getBoundingClientRect();
      if (box.width < 8 || box.height < 8) continue;
      const x = box.left + box.width / 2, y = box.top + box.height / 2;
      if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue;
      const top = document.elementFromPoint(x, y);
      if (!map?.contains(top) || top?.classList?.contains('leaflet-interactive')) continue;
      return { x, y };
    }
    return null;
  });
  expect(target).not.toBeNull();
  await page.mouse.click(target.x, target.y);
  await expect(page.locator('#pointBanner')).toBeVisible();
  await expect(page.locator('#detailTitle')).toHaveText('Pinned point');
});

test('the left-panel toggle names the pane it reveals', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  await page.locator('#go').click();
  await expect.poll(() => page.locator('.result-row').count()).toBeGreaterThan(0);
  const toggle = page.locator('#swapFace');
  await expect(toggle).toHaveAttribute('aria-label', 'Show selected route');

  await page.locator('.result-row').first().click();
  await expect(page.locator('.side-left .face[data-face="detail"]')).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-label', 'Show people and start places');
  await expect(page.locator('#start-p1')).toBeHidden();

  await toggle.click();
  await expect(page.locator('.side-left .face[data-face="people"]')).toBeVisible();
  await expect(page.locator('#start-p1')).toBeVisible();
  await expect(page.locator('[data-walk]').first()).toBeVisible();
});

test('fare mode orders results by the displayed fare spread', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  await page.locator('#fairnessToggle [data-fairness="fare"]').click();
  await page.locator('#go').click();
  await expect.poll(() => page.locator('.result-row').count()).toBeGreaterThan(1);
  const spreads = await page.locator('.result-row').evaluateAll(rows => rows.map(row => {
    const label = row.querySelector('.result-times > span')?.textContent || '';
    return Number((label.match(/[\d.]+/) || [0])[0]);
  }));
  expect(spreads.every(Number.isFinite)).toBe(true);
  expect(spreads).toEqual([...spreads].sort((a, b) => a - b));
});

test('bus fares are marked estimated only when a band fallback is used', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  await page.locator('#go').click();
  await expect.poll(() => page.locator('.result-row').count()).toBeGreaterThan(1);

  // Diagnostics export carries the provenance of every leg on every result.
  await page.locator('#betaBadge').click();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#exportDiagnostics').click();
  const dump = JSON.parse(readFileSync(await (await downloadPromise).path(), 'utf8'));
  const busLegs = dump.areas.flatMap(area => area.routes.flatMap(route => route.legs.filter(leg => leg.mode === 'bus')));
  expect(busLegs.length).toBeGreaterThan(0);
  for (const leg of busLegs) {
    expect(['td-snapshot', 'band']).toContain(leg.fareSource);
    // Exact full fares must be shown as exact; only band fallbacks get ≈.
    expect(leg.fareEstimated).toBe(leg.fareSource === 'band');
    expect(leg.fare).toBeGreaterThan(0);
  }
  expect(busLegs.some(leg => leg.fareSource === 'td-snapshot' && !leg.fareEstimated)).toBe(true);

  // The visible chips must agree with the exported provenance for the selected
  // area: no ≈ on snapshot fares, and ≈ on every band fallback.
  const selectedBus = dump.selectedArea.routes.flatMap(route => route.legs.filter(leg => leg.mode === 'bus'));
  const marked = await page.locator('#steps .route-bus .leg-meta .fare').evaluateAll(els =>
    els.map(el => Boolean(el.querySelector('.fare-estimate'))));
  expect(marked.length).toBe(selectedBus.length);
  expect(marked).toEqual(selectedBus.map(leg => leg.fareEstimated));
});

test('the rejected last-mode toggle is announced in the shared status', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  await page.locator('.chip[data-mode="rail"]').click();
  await page.locator('.chip[data-mode="bus"]').click();
  await expect(page.locator('#error')).toHaveText(EN_CATALOGUE['error.noMode']);
  await expect(page.locator('#actionStatus')).toBeVisible();
  await expect(page.locator('#actionStatus')).toContainText(EN_CATALOGUE['error.noMode']);
  await expect(page.locator('.chip[data-mode="bus"]')).toHaveAttribute('aria-pressed', 'true');
});

test('removing a person offers an undo that restores them', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  await expect(page.locator('.card')).toHaveCount(2);
  await page.locator('button[aria-label="Remove person B"]').click();
  await expect(page.locator('.card')).toHaveCount(1);
  await expect(page.locator('#actionStatus')).toBeVisible();
  await expect(page.locator('#actionStatus')).toContainText('Removed Person B.');
  await page.locator('#actionStatus .action-undo').click();
  await expect(page.locator('.card')).toHaveCount(2);
  await expect(page.locator('#actionStatus')).toContainText('Restored Person B.');
});

test('saving a person announces success outside the hover tooltip', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  // Only one start is set, so no search flips the sidebar away from the cards.
  const input = page.locator('#start-p1');
  await input.fill('North Point');
  await input.press('Tab');
  await expect(input).toHaveValue('North Point');
  await page.locator('button[aria-label="Save person"]').first().click();
  await expect(page.locator('#actionStatus')).toBeVisible();
  await expect(page.locator('#actionStatus')).toHaveText('Saved to your people');
});

test('Enter on an unambiguous start commits it and runs the search', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  // The default scenario already has two starts, so typing over one is enough
  // to prove Enter commits the place and starts a search without clicking Go.
  const input = page.locator('#start-p2');
  await expect(input).toHaveValue('North Point');
  await input.fill('Tsuen Wan');
  await expect(page.locator('#suggest-p2')).toBeVisible();
  await input.press('Enter');
  await expect(page.locator('#suggest-p2')).toBeHidden();
  await expect(input).toHaveValue('Tsuen Wan');
  await expect.poll(() => page.locator('.result-row').count()).toBeGreaterThan(0);
});

test('the results count and legal summaries follow the selected language', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  await page.locator('#go').click();
  await expect.poll(() => page.locator('.result-row').count()).toBeGreaterThan(0);
  const rows = await page.locator('.result-row').count();
  const en = await (await page.request.get('i18n/en.json')).json();
  await expect(page.locator('#nres')).toHaveText(en['results.header'].replace('{count}', String(rows)));

  const german = await (await page.request.get('i18n/de.json')).json();
  await page.locator('#locale').selectOption('de');
  await expect(page.locator('#nres')).toHaveText(german['results.header'].replace('{count}', String(rows)));
  await page.locator('.legal-button[data-legal="process"]').click();
  await expect(page.locator('.legal-summary')).toHaveAttribute('lang', 'de');
  await expect(page.locator('.legal-summary')).toHaveText(german['legal.summaryProcess']);
  await expect(page.locator('#legalBody')).toHaveAttribute('lang', 'en');
  await expect(page.locator('.legal-note')).toHaveText(german['legal.englishOnly']);
});

test('truncated result names expose their full value', async ({ page }) => {
  await page.goto('/');
  const [northPoint, tsuenWan] = await Promise.all([nodeOrigin(page, 'North Point'), nodeOrigin(page, 'Tsuen Wan')]);
  const longName = 'Alexandra Verylongname That Cannot Fit In A Result Row';
  const url = await shareUrl(page, {
    v: 1,
    people: [
      { id: 'p1', name: longName, origin: northPoint, walkMinutes: 20 },
      { id: 'p2', name: 'B', origin: tsuenWan, walkMinutes: 20 },
    ],
    settings,
    locale: 'en',
  });
  await page.goto(url);
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  await page.locator('#go').click();
  await expect.poll(() => page.locator('.result-row').count()).toBeGreaterThan(0);
  const name = page.locator('.result-row .person-name').first();
  await expect(name).toHaveAttribute('title', longName);
  await expect(name).toHaveAttribute('aria-label', longName);
});

test('the desktop beta badge shows its on/off state', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  await expect(page.locator('#betaBadgeState')).toBeVisible();
  await expect(page.locator('#betaBadgeState')).toHaveText('Off');
  await page.locator('#betaBadge').click();
  await expect(page.locator('#betaBadge')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#betaBadgeState')).toHaveText('On');
  await page.locator('#betaBadge').click();
  await expect(page.locator('#betaBadgeState')).toHaveText('Off');
});

test('long person names wrap inside the route detail instead of being clipped', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  const longName = 'W'.repeat(120);
  await page.locator('#name-p1').fill(longName);
  await page.locator('#go').click();
  await expect.poll(() => page.locator('.result-row').count()).toBeGreaterThan(0);
  await page.locator('.result-row[data-index="0"]').click();
  await expect.poll(() => page.locator('#steps .step b').count()).toBeGreaterThan(0);
  const name = page.locator('#steps .step b').first();
  await expect(name).toBeVisible();
  await expect(name).toHaveCSS('overflow-wrap', 'anywhere');
  const [nameBox, textBox] = await Promise.all([
    name.boundingBox(),
    page.locator('#steps .step .txt').first().boundingBox(),
  ]);
  expect(nameBox.width).toBeLessThanOrEqual(textBox.width + 1);
});

test('the rejected last-mode status clears as soon as another mode is enabled', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  await page.locator('.chip[data-mode="rail"]').click();
  await page.locator('.chip[data-mode="bus"]').click();
  await expect(page.locator('#actionStatus')).toBeVisible();
  await expect(page.locator('#actionStatus')).toContainText(EN_CATALOGUE['error.noMode']);
  await expect(page.locator('.chip[data-mode="bus"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.chip[data-mode="lightRail"]').click();
  await expect(page.locator('#actionStatus')).toBeHidden();
  await expect(page.locator('.chip[data-mode="lightRail"]')).toHaveAttribute('aria-pressed', 'true');
});

test('an explicit Search focuses the first result without stealing focus on recompute', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  await page.locator('#go').click();
  await expect.poll(() => page.locator('.result-row').count()).toBeGreaterThan(0);
  await expect(page.locator('.result-row').first()).toBeFocused();
  await page.locator('#name-p1').fill('Focused Name');
  await expect(page.locator('#name-p1')).toBeFocused();
});

test('sharing puts the copied scenario fragment in the address bar', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  await page.locator('#share').click();
  await expect(page).toHaveURL(/#s=/);
  const hash = await page.evaluate(() => location.hash);
  expect(hash.startsWith('#s=')).toBe(true);
  expect(atob(hash.slice(3).replace(/-/g, '+').replace(/_/g, '/'))).toContain('people');
});

test('reaching the eight-person limit announces why the add button is disabled', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  for (let i = 0; i < 6; i += 1) await page.locator('#add').click();
  await expect(page.locator('#add')).toBeDisabled();
  await expect(page.locator('#actionStatus')).toContainText(EN_CATALOGUE['people.max']);
});

test('adding a saved person already on the board is announced instead of being silent', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  await expect.poll(() => page.locator('.card').count()).toBe(2);
  await page.locator('#library').click();
  const row = page.locator('.directory-row').first();
  await row.locator('button[data-action="add"]').click();
  await expect(page.locator('#peopleDialog')).toBeHidden();
  await expect.poll(() => page.locator('.card').count()).toBe(3);
  await expect(page.locator('#actionStatus')).toContainText(EN_CATALOGUE['people.saved']);
});

test('deleting a saved person announces the removal', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  await page.locator('#library').click();
  const row = page.locator('.directory-row').first();
  await row.locator('button[data-action="delete"]').click();
  await row.locator('button[data-action="delete"]').click();
  await expect(page.locator('#actionStatus')).toContainText(EN_CATALOGUE['people.removed'].replace('{name}', 'Person A'));
  const directory = await page.evaluate(() => JSON.parse(localStorage.getItem('hkfair.v2.directory') || '[]'));
  expect(directory.map(p => p.name)).not.toContain('Person A');
});

test('an unreachable outlying island explains that extra modes cannot help', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  const [cheungChau, loWu] = await Promise.all([
    nodeOrigin(page, 'Cheung Chau Ferry Pier at San Hing Praya Street'),
    nodeOrigin(page, 'Lo Wu'),
  ]);
  const url = await shareUrl(page, {
    v: 1,
    people: [
      { id: 'p1', name: 'Island', origin: cheungChau, walkMinutes: 20 },
      { id: 'p2', name: 'Mainland', origin: loWu, walkMinutes: 20 },
    ],
    settings: { ...settings, modes: ['rail', 'bus', 'lightRail', 'ferry'] },
    locale: 'en',
  });
  await page.goto(url);
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  await expect.poll(() => page.locator('#error').innerText()).toContain('no area is reachable');
  await expect(page.locator('#error')).toHaveText(EN_CATALOGUE['error.noCommonArea']);
  await expect(page.locator('#error')).toContainText('enabling more modes cannot fix that');
});
