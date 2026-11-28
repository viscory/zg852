const { test, expect, devices } = require('@playwright/test');
const { sliderPosition } = require('./helpers');

// Chromium is already pinned by the project config; drop the device's
// defaultBrowserType instead of overriding it inside a describe block.
const iphone = Object.fromEntries(Object.entries(devices['iPhone 15'])
  .filter(([key]) => key !== 'defaultBrowserType'));

async function setRange(page, selector, value) {
  const next = selector === '#tolerance' ? await sliderPosition(Number(value)) : value;
  await page.locator(selector).evaluate((el, n) => {
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

test.beforeEach(async ({ page }) => {
  await page.route('**/sw.js', route => route.abort());
  await page.route('**/basemaps.cartocdn.com/**', route => route.abort());
  await page.route('**/tile.openstreetmap.org/**', route => route.abort());
  await page.route('**/tiles.openfreemap.org/**', route => route.abort());
  await page.route('**/photon.komoot.io/api/**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ features: [] }),
  }));
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
});

test('a delayed timetable keeps the whole app behind a staged loading overlay', async ({ page }) => {
  const en = await catalog(page, 'en');
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/data/network.json', async route => {
    await gate;
    await route.continue();
  });
  await page.goto('/');
  try {
    await expect(page.locator('#loadingOverlay')).toBeVisible();
    await expect(page.locator('#loadingOverlay')).toHaveAttribute('data-state', 'loading');
    await expect(page.locator('#loadingDetail')).toHaveText(en['loading.timetable']);
    await expect(page.locator('body')).toHaveAttribute('aria-busy', 'true');
    await expect(page.locator('#loadingRetry')).toBeHidden();
    await expect(page.locator('#loadingError')).toBeHidden();
  } finally {
    release();
  }
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  await expect(page.locator('#loadingOverlay')).toBeHidden();
  await expect(page.locator('body')).not.toHaveAttribute('aria-busy', 'true');
});

test('a search shows a visible calculating card over the map', async ({ page }) => {
  const en = await catalog(page, 'en');
  // Record the transient state: on a fast machine the card can appear and
  // disappear inside one poll interval.
  await page.evaluate(() => {
    window.__progress = { seen: false, text: '', busy: false };
    const el = document.getElementById('searchProgress');
    new MutationObserver(() => {
      if (!el.hidden) {
        window.__progress.seen = true;
        window.__progress.text = document.getElementById('searchProgressText').textContent;
        window.__progress.busy = el.getAttribute('aria-busy') === 'true';
      }
    }).observe(el, { attributes: true, attributeFilter: ['hidden', 'aria-busy'] });
  });
  await page.locator('#go').click();
  await expect.poll(() => page.evaluate(() => window.__progress.seen)).toBe(true);
  const seen = await page.evaluate(() => window.__progress);
  expect(seen.text).toBe(en['search.calculating']);
  expect(seen.busy).toBe(true);
  await expect.poll(() => page.locator('.result-row').count()).toBeGreaterThan(0);
  await expect(page.locator('#searchProgress')).toBeHidden();
});

test('the first search does not freeze the page in one long task', async ({ page }) => {
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  await page.evaluate(() => {
    window.__longtasks = [];
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) window.__longtasks.push(entry.duration);
    }).observe({ entryTypes: ['longtask'] });
  });
  await page.locator('#go').click();
  await expect.poll(() => page.locator('.result-row').count()).toBeGreaterThan(0);
  const largest = await page.evaluate(() => Math.max(0, ...window.__longtasks));
  // The solver yields between phases; no single task may block for the old
  // one-second freeze, even though total compute time is still measurable.
  expect(largest).toBeLessThan(500);
});

test('removing the pinned person clears pin mode', async ({ page }) => {
  await page.locator('.card').first().locator('.pin').click();
  await expect(page.locator('#map')).toHaveClass(/pinning/);
  await expect(page.locator('#pinBanner')).toBeVisible();

  await page.locator('.card').first().locator('.remove').click();
  await expect(page.locator('.card')).toHaveCount(1);
  await expect(page.locator('#map')).not.toHaveClass(/pinning/);
  await expect(page.locator('#pinBanner')).toBeHidden();
});

test('locale switch preserves an in-progress place query, caret and suggestions', async ({ page }) => {
  const traditional = await catalog(page, 'zh-Hant');
  const input = page.locator('.card').first().locator('.start-input');
  const suggestions = page.locator('.card').first().locator('.suggestions');

  await input.fill('Central');
  await expect(input).toBeFocused();
  await expect(suggestions).toBeVisible();
  await expect(input).toHaveAttribute('aria-expanded', 'true');
  const count = await suggestions.locator('.suggestion').count();
  expect(count).toBeGreaterThan(0);
  await input.evaluate(el => el.setSelectionRange(3, 5));

  await page.locator('#locale').evaluate(el => {
    el.value = 'zh-Hant';
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });

  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hant');
  await expect(page.locator('#goLabel')).toHaveText(traditional['options.search']);
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('Central');
  await expect(input).toHaveAttribute('aria-expanded', 'true');
  await expect(suggestions).toBeVisible();
  await expect(suggestions.locator('.suggestion')).toHaveCount(count);
  expect(await input.evaluate(el => [el.selectionStart, el.selectionEnd])).toEqual([3, 5]);
});

test('renaming a person updates result rows and route steps without losing focus', async ({ page }) => {
  await page.locator('#go').click();
  await expect.poll(() => page.locator('.result-row').count()).toBeGreaterThan(0);
  await page.locator('.result-row').first().click();

  const steps = page.locator('#steps .step:not(.route-empty)');
  await expect(steps).toHaveCount(2);
  await expect(steps.first()).toContainText('Person A');
  const row = page.locator('.result-row').first();
  await expect(row.locator('.result-person').first().locator('.person-name')).toHaveText('Person A');

  // Selecting a result reveals the detail face; swap back to edit the name.
  await expect(page.locator('.side-left .face[data-face="detail"]')).toBeVisible();
  await page.locator('#swapFace').click();
  await expect(page.locator('.side-left .face[data-face="people"]')).toBeVisible();
  const nameInput = page.locator('.card').first().locator('.name-input');
  await nameInput.fill('Alex');
  await expect(nameInput).toBeFocused();

  await expect(row.locator('.result-person').first().locator('.person-name')).toHaveText('Alex');
  await expect(row.locator('.result-person').first().locator('.avatar')).toHaveText('A');
  await expect(steps.first().locator('.txt > b')).toHaveText('Alex');
  await expect(steps.first().locator('.dot')).toHaveText('A');
});

test('result rows and saved-directory rows expose listitem semantics', async ({ page }) => {
  await expect(page.locator('#resultsList')).toHaveAttribute('role', 'list');
  await page.locator('#go').click();
  await expect(page.locator('#go')).toBeEnabled();
  const resultItems = page.locator('#resultsList > [role="listitem"]');
  await expect.poll(() => resultItems.count()).toBeGreaterThan(0);
  const resultCount = await resultItems.count();
  for (let index = 0; index < resultCount; index += 1) {
    const item = resultItems.nth(index);
    await expect(item.locator('button')).not.toHaveCount(0);
    await expect(item.locator('button').first()).toHaveAccessibleName(/\S/);
  }

  // Search reveals the detail face; swap back to reach the save button.
  await expect(page.locator('.side-left .face[data-face="detail"]')).toBeVisible();
  await page.locator('#swapFace').click();
  await expect(page.locator('.side-left .face[data-face="people"]')).toBeVisible();
  await page.locator('.card').first().locator('.save-person').click();
  await page.locator('#library').click();
  await expect(page.locator('#directoryList')).toHaveAttribute('role', 'list');
  await expect.poll(() => page.locator('.directory-row').count()).toBeGreaterThan(0);
  const directoryRoles = await page.locator('.directory-row').evaluateAll(rows => rows.map(row => row.getAttribute('role')));
  expect(directoryRoles.length).toBeGreaterThan(0);
  expect(directoryRoles.every(role => role === 'listitem')).toBe(true);
});

test('the unlimited hint waits for network and results', async ({ page }) => {
  await setRange(page, '#tolerance', '3.05');
  await expect(page.locator('#tolval')).toHaveText('Unlimited');
  await expect(page.locator('#unboundedHint')).toBeHidden();
  await expect(page.locator('#pointBanner')).toBeHidden();
  await expect(page.locator('#detail')).toBeHidden();

  const map = await page.locator('#map').boundingBox();
  expect(map).not.toBeNull();
  await page.mouse.click(map.x + map.width * 0.5, map.y + map.height * 0.5);
  await expect(page.locator('#pointBanner')).toBeHidden();
  await expect(page.locator('#detail')).toBeHidden();

  await page.locator('#go').click();
  await expect.poll(() => page.locator('.result-row').count()).toBeGreaterThan(0);
  await expect(page.locator('#unboundedHint')).toBeVisible();
});

test.describe('mobile screen stability', () => {
  test.use(iphone);

  test('recomputes do not move the user off Plan or Map', async ({ page }) => {
    await expect(page.locator('body')).toHaveAttribute('data-mobile-view', 'plan');
    await expect(page.locator('#mobileTabbar')).toBeVisible();

    // Record the debounced recompute's actual working state instead of sleeping.
    await page.evaluate(() => {
      const go = document.getElementById('go');
      window.__workingSeen = false;
      const observer = new MutationObserver(() => {
        if (go.getAttribute('aria-label') === 'Working') window.__workingSeen = true;
      });
      observer.observe(go, { attributes: true, attributeFilter: ['aria-label'] });
      window.__stopWorkingWatch = () => observer.disconnect();
    });
    const resetWatch = () => page.evaluate(() => { window.__workingSeen = false; });
    const waitForRecompute = async () => {
      await expect.poll(() => page.evaluate(() => window.__workingSeen)).toBe(true);
      await expect.poll(() => page.locator('#goLabel').textContent()).toBe('Find fair areas');
    };

    await resetWatch();
    await page.locator('#includeHeadway').uncheck();
    await waitForRecompute();
    await expect.poll(() => page.locator('.result-row').count()).toBeGreaterThan(0);
    await expect(page.locator('body')).toHaveAttribute('data-mobile-view', 'plan');
    await expect(page.locator('.side-left')).toBeVisible();

    await page.locator('#mobileTabbar [data-mobile-view="map"]').click();
    await expect(page.locator('body')).toHaveAttribute('data-mobile-view', 'map');
    await page.locator('#mobileTabbar [data-mobile-view="plan"]').click();
    await resetWatch();
    await setRange(page, '#tolerance', '0.2');
    await expect.poll(() => page.locator('#tolval').textContent()).toBe('20%');
    await waitForRecompute();
    await expect(page.locator('body')).toHaveAttribute('data-mobile-view', 'plan');

    await page.evaluate(() => window.__stopWorkingWatch());
    await page.locator('#go').click();
    await expect(page.locator('body')).toHaveAttribute('data-mobile-view', 'results');
  });
});
