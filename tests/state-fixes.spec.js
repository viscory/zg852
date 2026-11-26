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

async function savedPeople(page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('hkfair.v2.people');
    return raw === null ? null : JSON.parse(raw);
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

async function onePersonState(page) {
  return page.evaluate(async () => {
    const nodes = await (await fetch('data/nodes.json')).json();
    const node = nodes.names.findIndex((name, i) => name === 'Tsuen Wan' && nodes.kind[i] === 1);
    return {
      v: 1,
      people: [{
        id: 'p1',
        name: 'Solo',
        origin: { kind: 'node', node, label: nodes.names[node], lat: nodes.lat[node], lon: nodes.lon[node] },
        walkMinutes: 20,
      }],
      settings: { modes: ['rail'], tolerance: 0.15, includeHeadway: false },
      locale: 'en',
      selected: { kind: 'result', index: 0 },
    };
  });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.setItem('hkfair.v2.locale', 'en'); } catch (err) { /* storage disabled */ }
  });
  await preparePage(page);
});

test('a one-person scenario survives reload', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  await expect(page.locator('.card')).toHaveCount(2);

  await page.locator('.card').nth(1).locator('.remove').click();
  await expect(page.locator('.card')).toHaveCount(1);
  await page.locator('.card').first().locator('.name-input').fill('Solo');
  expect(await savedPeople(page)).toHaveLength(1);
  expect((await savedPeople(page))[0].name).toBe('Solo');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  await expect(page.locator('.card')).toHaveCount(1);
  await expect(page.locator('.card').first().locator('.name-input')).toHaveValue('Solo');
  expect(await savedPeople(page)).toHaveLength(1);
});

test('a malformed share hash shows an inline error before it is cleared', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  const en = await catalog(page, 'en');
  const expected = en['share.invalid'] || 'share.invalid';
  const url = `${new URL(page.url()).origin}${new URL(page.url()).pathname}#s=not-valid-base64!!`;

  // The fragment is consumed on arrival, so the error is shown by the
  // hash-change import itself rather than surviving a later reload.
  await page.goto(url);

  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  expect(new URL(page.url()).hash).toBe('');
  await expect(page.locator('#error')).toBeVisible();
  await expect(page.locator('#error')).toHaveText(expected);
});

async function twoPersonShareState(page, name) {
  return page.evaluate(value => {
    const people = JSON.parse(localStorage.getItem('hkfair.v2.people'));
    people[0].name = value;
    return { v: 1, people, settings: JSON.parse(localStorage.getItem('hkfair.v2.settings')), locale: 'en', selected: { kind: 'result', index: 0 } };
  }, name);
}

test('a share link is consumed so later edits survive a reload', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  await page.locator('.name-input').first().fill('Local User');
  await expect.poll(async () => (await savedPeople(page))[0].name).toBe('Local User');
  await page.goto(await makeShareUrl(page, await twoPersonShareState(page, 'Shared User')));
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  expect(new URL(page.url()).hash).toBe('');
  await expect(page.locator('#actionStatus')).toContainText('Shared scenario opened');
  expect((await savedPeople(page))[0].name).toBe('Shared User');
  await page.locator('.name-input').first().fill('Edited After Share');
  await expect.poll(async () => (await savedPeople(page))[0].name).toBe('Edited After Share');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  expect((await savedPeople(page))[0].name).toBe('Edited After Share');
});

test('Undo after a share link restores the previous local scenario', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  await page.locator('.name-input').first().fill('Local User');
  await expect.poll(async () => (await savedPeople(page))[0].name).toBe('Local User');
  await page.goto(await makeShareUrl(page, await twoPersonShareState(page, 'Shared User')));
  await expect(page.locator('#actionStatus .action-undo')).toBeVisible();
  await page.locator('#actionStatus .action-undo').click();
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  expect((await savedPeople(page))[0].name).toBe('Local User');
});

test('a one-person share link loads that person and shows the need-two error', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  const en = await catalog(page, 'en');
  const url = await makeShareUrl(page, await onePersonState(page));

  await page.goto(url);

  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  expect(new URL(page.url()).hash).toBe('');
  await expect(page.locator('.card')).toHaveCount(1);
  expect(await nameValues(page)).toEqual(['Solo']);
  await expect(page.locator('#error')).toBeVisible();
  await expect(page.locator('#error')).toHaveText(en['error.needTwo'] || 'Add at least two people with a start place.');
});
