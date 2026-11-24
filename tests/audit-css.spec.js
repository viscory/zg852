const { test, expect, devices } = require('@playwright/test');

async function openApp(page) {
  await page.route('**/sw.js', route => route.abort());
  await page.route('**/basemaps.cartocdn.com/**', route => route.abort());
  await page.route('**/tile.openstreetmap.org/**', route => route.abort());
  await page.route('**/tiles.openfreemap.org/**', route => route.abort());
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
}

test.describe('desktop layout fixes', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test.beforeEach(async ({ page }) => {
    await openApp(page);
    await page.locator('#go').click();
    await expect.poll(() => page.locator('.result-row').count()).toBeGreaterThan(2);
  });

  test('the sticky footer reserves space instead of covering result rows', async ({ page }) => {
    const metrics = await page.evaluate(() => {
      const footer = document.querySelector('.rightbar-footer');
      const footerBox = footer.getBoundingClientRect();
      const results = document.querySelector('.results-section');
      const resultsBox = results.getBoundingClientRect();
      const rows = [...document.querySelectorAll('.result-row')].map(row => row.getBoundingClientRect());
      return {
        position: getComputedStyle(footer).position,
        marginBottom: getComputedStyle(footer).marginBottom,
        footerTop: footerBox.top,
        resultsBottom: resultsBox.bottom,
        scrollable: results.scrollHeight > results.clientHeight,
        overlaps: rows.some(row => Math.min(row.bottom, resultsBox.bottom) > footerBox.top + 1),
      };
    });
    expect(metrics.position).toBe('sticky');
    expect(metrics.marginBottom).toBe('0px');
    expect(metrics.scrollable).toBe(true);
    expect(metrics.overlaps).toBe(false);

    await page.locator('.result-row').nth(2).click();
    await expect(page.locator('.result-row.selected')).toHaveCount(1);
  });

  test('Urdu mirrors the desktop layout without horizontal overflow', async ({ page }) => {
    await page.locator('#locale').selectOption('ur');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    const metrics = await page.evaluate(() => {
      window.scrollTo(0, 0);
      return {
        innerWidth: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        scrollX: window.scrollX,
        peopleX: document.querySelector('.side-left').getBoundingClientRect().x,
        optionsX: document.querySelector('.side-right').getBoundingClientRect().x,
      };
    });
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth);
    expect(metrics.scrollX).toBe(0);
    expect(metrics.peopleX).toBeGreaterThan(metrics.optionsX);
  });
});

const PHONE = devices['iPhone 15'];

test.describe('coarse-pointer adaptive deck', () => {
  test.use({
    viewport: PHONE.viewport,
    screen: PHONE.screen,
    deviceScaleFactor: PHONE.deviceScaleFactor,
    isMobile: true,
    hasTouch: true,
    userAgent: PHONE.userAgent,
  });

  test.beforeEach(async ({ page }) => {
    await openApp(page);
  });

  for (const viewport of [{ width: 852, height: 393 }, { width: 768, height: 1024 }]) {
    test(`${viewport.width}x${viewport.height} uses the mobile deck with #go on screen`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await expect.poll(() => page.evaluate(() => matchMedia('(max-width: 1024px) and (pointer: coarse)').matches)).toBe(true);
      await expect(page.locator('#mobileNav')).toBeVisible();
      await expect(page.locator('#sheetHandle')).toBeVisible();
      await expect(page.locator('.layout')).toHaveCSS('display', 'block');
      const metrics = await page.evaluate(() => {
        const go = document.querySelector('#go').getBoundingClientRect();
        return {
          goTop: go.top,
          goBottom: go.bottom,
          innerHeight: window.innerHeight,
          docHeight: document.documentElement.scrollHeight,
          docWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
        };
      });
      expect(metrics.goTop).toBeGreaterThanOrEqual(0);
      expect(metrics.goBottom).toBeLessThanOrEqual(metrics.innerHeight);
      expect(metrics.docHeight).toBeLessThanOrEqual(metrics.innerHeight + 1);
      expect(metrics.docWidth).toBeLessThanOrEqual(metrics.innerWidth);
    });
  }

  test('attribution and legend stay visible on coarse layouts', async ({ page }) => {
    for (const viewport of [{ width: 393, height: 659 }, { width: 852, height: 393 }, { width: 768, height: 1024 }]) {
      await page.setViewportSize(viewport);
      const info = await page.evaluate(() => ({
        attribution: getComputedStyle(document.querySelector('.leaflet-control-attribution')).display,
        legend: getComputedStyle(document.querySelector('.legend')).display,
        attributionText: document.querySelector('.leaflet-control-attribution').textContent,
        legendText: document.querySelector('.legend').textContent,
      }));
      expect(info.attribution).not.toBe('none');
      expect(info.legend).not.toBe('none');
      expect(info.attributionText).toContain('OpenStreetMap contributors');
      expect(info.attributionText).toContain('OpenFreeMap');
      expect(info.legendText).toContain('Fair area');
    }
  });

  test('half and full snaps give the results much more usable height', async ({ page }) => {
    await page.locator('#go').click();
    await expect.poll(() => page.locator('.result-row').count()).toBeGreaterThan(0);
    const halfHeight = await page.locator('.results-section').evaluate(el => el.getBoundingClientRect().height);
    await expect.poll(() => halfHeight).toBeGreaterThan(140);
    const visibleResults = () => page.evaluate(() => {
      const results = document.querySelector('.results-section').getBoundingClientRect();
      const sheet = document.querySelector('.side-right').getBoundingClientRect();
      const first = document.querySelector('.result-row').getBoundingClientRect();
      return {
        height: Math.max(0, Math.min(results.bottom, sheet.bottom) - Math.max(results.top, sheet.top)),
        visibleFirstResult: Math.max(0, Math.min(first.bottom, sheet.bottom) - Math.max(first.top, sheet.top)),
        navBottom: document.querySelector('#mobileNav').getBoundingClientRect().bottom,
        sheetTop: sheet.top,
      };
    });
    const half = await visibleResults();
    expect(half.visibleFirstResult).toBeGreaterThan(100);

    await page.locator('#sheetHandle').click();
    await expect(page.locator('body')).toHaveAttribute('data-mobile-snap', 'full');
    await expect.poll(async () => (await visibleResults()).height).toBeGreaterThan(260);
    const full = await visibleResults();
    expect(full.height).toBeGreaterThan(half.height + 80);
    expect(full.navBottom).toBeLessThanOrEqual(full.sheetTop + 1);
  });
});
