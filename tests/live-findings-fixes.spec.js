const { test, expect } = require('@playwright/test');

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
  await expect(page.locator('#nres')).toContainText('fairest first');
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
  await expect(page.locator('#error')).toHaveText('Enable at least one transport mode.');
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
