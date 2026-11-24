const { test, expect, devices } = require('@playwright/test');

test.use({ ...devices['iPhone 15'], browserName: 'chromium' });

async function setRange(page, id, value) {
  await page.locator(id).evaluate((el, next) => {
    el.value = next;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}

// A search re-enables #go only after rendering results and drawing the map,
// so waiting for both removes the race with stale heat cells/coordinates.
async function waitForSearch(page, { heat = false } = {}) {
  await expect(page.locator('#go')).toBeEnabled();
  await expect.poll(() => page.locator('.result-row').count()).toBeGreaterThan(0);
  if (heat) await expect.poll(() => page.locator('path.heat-cell').count()).toBeGreaterThan(0);
}

test.beforeEach(async ({ page }) => {
  await page.route('**/sw.js', route => route.abort());
  await page.route('**/basemaps.cartocdn.com/**', route => route.abort());
  await page.route('**/tile.openstreetmap.org/**', route => route.abort());
  await page.route('**/tiles.openfreemap.org/**', route => route.abort());
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
});

test('opens with a full-height map, reachable search and 44px controls', async ({ page }) => {
  await expect(page.locator('#mobileNav')).toBeVisible();
  await expect(page.locator('#sheetHandle')).toBeVisible();
  await expect(page.locator('#go')).toBeVisible();
  const metrics = await page.evaluate(() => {
    const controls = [...document.querySelectorAll('button,select,input[type=text],input[type=range],a')]
      .filter(el => el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0);
    const small = controls.filter(el => {
      const box = el.getBoundingClientRect();
      return box.width < 44 || box.height < 44;
    }).map(el => `${el.tagName}#${el.id}.${el.className}`.slice(0, 80));
    const go = document.querySelector('#go').getBoundingClientRect();
    return {
      innerHeight: window.innerHeight,
      overflow: document.documentElement.scrollWidth > window.innerWidth,
      mapHeight: document.querySelector('#map').getBoundingClientRect().height,
      goBottom: go.bottom,
      small,
    };
  });
  expect(metrics.overflow).toBe(false);
  expect(metrics.mapHeight).toBeGreaterThan(400);
  expect(metrics.goBottom).toBeLessThan(metrics.innerHeight);
  expect(metrics.small).toEqual([]);
});

test('beta parameters scroll inside the sheet without hiding results', async ({ page }) => {
  await page.locator('#betaBadge').click();
  await expect(page.locator('#vectorSection')).toBeVisible();
  const metrics = await page.evaluate(() => {
    const options = document.querySelector('#optionsPanel');
    const footer = document.querySelector('.rightbar-footer').getBoundingClientRect();
    return {
      scrollable: options.scrollHeight > options.clientHeight,
      footerBottom: footer.bottom,
      innerHeight: window.innerHeight,
      resultsVisible: document.querySelector('.results-section').getBoundingClientRect().height > 40,
    };
  });
  expect(metrics.scrollable).toBe(true);
  expect(metrics.footerBottom).toBeLessThanOrEqual(metrics.innerHeight);
  expect(metrics.resultsVisible).toBe(true);
  await page.locator('#optionsPanel').evaluate(el => { el.scrollTop = el.scrollHeight; });
  await expect(page.locator('#vec-shopping')).toBeVisible();
});

test('bounded heat tap promotes the route sheet with bar-only ratings', async ({ page }) => {
  await page.locator('#go').click();
  await waitForSearch(page, { heat: true });
  const target = await page.locator('path.heat-cell').evaluateAll(elements => {
    const candidate = elements.map(el => el.getBoundingClientRect())
      .filter(box => box.width > 20 && box.x > 20 && box.x < 320 && box.y > 125 && box.y < 220)
      .map(box => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 }))
      .find(point => document.elementFromPoint(point.x, point.y)?.classList.contains('heat-cell'));
    return candidate || null;
  });
  expect(target).not.toBeNull();
  await page.mouse.click(target.x + 36, target.y);
  await expect.poll(() => page.locator('body').getAttribute('data-mobile-pane')).toBe('route');
  await expect(page.locator('#mapTooltip')).toBeVisible();
  await expect(page.locator('#mapTooltip .tooltip-vector')).toHaveCount(6);
  await expect(page.locator('#mapTooltip')).not.toContainText('/100');
  await expect(page.locator('#interestRatings')).toBeVisible();
  await page.locator('#interestRatings summary').click();
  await expect(page.locator('#fitGrid .fit-row')).toHaveCount(6);
  await expect(page.locator('#interestRatings')).not.toContainText('/100');
  await expect(page.locator('#flipStage')).not.toHaveClass(/flip-in/);
});

test('sheet handle snaps and the mobile nav stays reachable when full', async ({ page }) => {
  await expect(page.locator('body')).toHaveAttribute('data-mobile-snap', 'half');
  await page.locator('#sheetHandle').click();
  await expect(page.locator('body')).toHaveAttribute('data-mobile-snap', 'full');
  const nav = await page.locator('#mobileNav').boundingBox();
  const handle = await page.locator('#sheetHandle').boundingBox();
  expect(handle.y).toBeGreaterThanOrEqual(nav.y + nav.height - 1);
  await page.locator('#mobileNav [data-mobile-pane="people"]').click();
  await expect(page.locator('body')).toHaveAttribute('data-mobile-pane', 'people');
  await expect(page.locator('body')).toHaveAttribute('data-mobile-snap', 'half');
  await expect(page.locator('.card').first()).toBeVisible();
  await page.locator('#mobileNav [data-mobile-pane="route"]').click();
  await expect(page.locator('body')).toHaveAttribute('data-mobile-pane', 'route');
  await expect(page.locator('body')).toHaveAttribute('data-mobile-snap', 'full');
});

test('unbounded point tap shows ratings without scores', async ({ page }) => {
  await setRange(page, '#tolerance', '3.05');
  await expect(page.locator('#tolval')).toHaveText('Unlimited');
  await page.locator('#go').click();
  await waitForSearch(page);
  await expect(page.locator('#unboundedHint')).toBeVisible();
  await page.mouse.click(196, 180);
  await expect(page.locator('#pointBanner')).toBeVisible();
  await expect.poll(() => page.locator('body').getAttribute('data-mobile-pane')).toBe('route');
  await expect(page.locator('.fit-row')).toHaveCount(6);
  await expect(page.locator('#interestRatings')).not.toContainText('/100');
});
