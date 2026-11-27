const { test, expect } = require('@playwright/test');

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

test('the saved-people button uses the bookmark icon', async ({ page }) => {
  const mask = await page.locator('#library .icon').evaluate(el => getComputedStyle(el).maskImage);
  expect(mask).toContain('lucide-bookmark');
  expect(mask).not.toContain('lucide-users');
});

test('an exact typed local place commits with Enter', async ({ page }) => {
  const card = page.locator('.card').first();
  const input = card.locator('.start-input');

  await input.fill('Kowloon Tong');
  await expect(card.locator('.suggestions')).toBeVisible();
  await input.press('Enter');

  await expect(input).toHaveValue('Kowloon Tong');
  await expect(card.locator('.suggestions')).toBeHidden();
  await expect(card.locator('.typed-origin-error')).toHaveCount(0);
  await expect(page.locator('#error')).toBeHidden();
});

test('clearing a start field clears its origin instead of silently reusing it', async ({ page }) => {
  const english = await catalog(page, 'en');
  const input = page.locator('.card').first().locator('.start-input');
  await expect(input).toHaveValue('Tsuen Wan');
  await input.fill('');
  await expect(input).toHaveValue('');

  await page.locator('#go').click();
  await expect(page.locator('#error')).toBeVisible();
  await expect(page.locator('#error')).toHaveText(english['error.missingOrigins']);
  await expect(page.locator('#resultsList')).toBeEmpty();
  await expect(page.locator('path.heat-cell')).toHaveCount(0);

  // The cleared origin is persisted, so a share link cannot leak the old place.
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('hkfair.v2.people')));
  expect(stored[0].origin).toBeNull();
});

test('a library filter reports no matches and clears when reopened', async ({ page }) => {
  const english = await catalog(page, 'en');
  await page.locator('#library').click();
  await expect(page.locator('.directory-row')).toHaveCount(2);

  // Both documented close paths must reopen to a clean, full library.
  for (const close of ['Escape', 'button']) {
    await page.locator('#directorySearch').fill('zzzz-no-match');
    await expect(page.locator('.directory-row')).toHaveCount(0);
    await expect(page.locator('.directory-empty')).toHaveText(english['people.libraryNoMatches']);
    await expect(page.locator('.directory-empty')).not.toHaveText(english['people.libraryEmpty']);
    if (close === 'Escape') await page.keyboard.press('Escape');
    else await page.locator('#libraryClose').click();
    await expect(page.locator('#peopleDialog')).toBeHidden();
    await page.locator('#library').click();
    await expect(page.locator('#directorySearch')).toHaveValue('');
    await expect(page.locator('.directory-row')).toHaveCount(2);
  }
});

test('bogus typed start text blocks search with an inline message', async ({ page }) => {
  const english = await catalog(page, 'en');
  const card = page.locator('.card').first();
  const input = card.locator('.start-input');

  await input.fill('qqq zzz nowhere');
  await expect(input).toHaveValue('qqq zzz nowhere');
  await page.locator('#go').click();

  await expect(page.locator('#error')).toContainText(english['search.selectSuggestion']);
  await expect(card.locator('.typed-origin-error')).toContainText(english['search.selectSuggestion']);
  await expect(page.locator('.result-row')).toHaveCount(0);
});

test('the eight-person limit shows an error and keeps the dialog open', async ({ page }) => {
  const english = await catalog(page, 'en');
  await page.locator('.card').first().locator('.save-person').click();
  for (let i = 0; i < 6; i++) await page.locator('#add').click();
  await expect(page.locator('.card')).toHaveCount(8);

  // Free a board slot so the saved profile can genuinely be added as a ninth.
  await page.locator('.card').first().locator('.remove').click();
  await page.locator('#add').click();
  await expect(page.locator('.card')).toHaveCount(8);
  await expect(page.locator('#add')).toBeDisabled();
  await expect(page.locator('#add')).toHaveAttribute('data-tooltip', english['people.max']);

  await page.locator('#library').click();
  const row = page.locator('.directory-row').filter({ hasText: 'Person A' });
  await expect(row).toHaveCount(1);
  await row.locator('[data-action="add"]').click();

  await expect(page.locator('#peopleDialog')).toBeVisible();
  await expect(page.locator('#peopleDialog .directory-error')).toBeVisible();
  await expect(page.locator('#peopleDialog .directory-error')).toContainText(english['people.max']);
  await expect(page.locator('#error')).toContainText(english['people.max']);
  await expect(page.locator('.card')).toHaveCount(8);
});

test('the highlighted autocomplete option exposes aria-selected', async ({ page }) => {
  const input = page.locator('.card').first().locator('.start-input');
  await input.fill('Central');
  const suggestions = page.locator('.card').first().locator('.suggestions');
  await expect(suggestions.locator('.suggestion').first()).toBeVisible();

  await input.press('ArrowDown');
  await expect(input).toHaveAttribute('aria-activedescendant', 'suggest-p1-option-0');
  await expect(suggestions.locator('.suggestion').nth(0)).toHaveAttribute('aria-selected', 'true');

  await input.press('ArrowDown');
  await expect(suggestions.locator('.suggestion').nth(0)).toHaveAttribute('aria-selected', 'false');
  await expect(suggestions.locator('.suggestion').nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(suggestions.locator('.suggestion[aria-selected="true"]')).toHaveCount(1);
});

test('a simulated Photon outage renders a disabled listbox error option', async ({ browser }) => {
  // Inject the failure in a fresh context so the shared beforeEach handler on
  // the main page stays reachable and untouched.
  const context = await browser.newContext({
    baseURL: process.env.TEST_BASE_URL || 'http://127.0.0.1:8765',
  });
  const page = await context.newPage();
  try {
    await context.route('**/sw.js', route => route.abort());
    await context.route('**/tiles.openfreemap.org/**', route => route.abort());
    await context.route('**/basemaps.cartocdn.com/**', route => route.abort());
    await context.route('**/tile.openstreetmap.org/**', route => route.abort());
    await context.route('**/photon.komoot.io/api/**', route => route.abort());
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');

    const input = page.locator('.card').first().locator('.start-input');
    await input.fill('Central');
    const error = page.locator('.card').first().locator('.suggestions .suggestion-error');
    await expect(error).toBeVisible();
    await expect(error).toHaveAttribute('role', 'option');
    await expect(error).toHaveAttribute('aria-disabled', 'true');
  } finally {
    await context.close();
  }
});

test('legal body links open inside the dialog and the body is marked English', async ({ page }) => {
  const hindi = await catalog(page, 'hi');
  await page.locator('#locale').selectOption('hi');
  await expect(page.locator('html')).toHaveAttribute('lang', 'hi');

  await page.locator('.legal-button[data-legal="process"]').click();
  const body = page.locator('#legalBody');
  await expect(body).toHaveAttribute('lang', 'en');
  await expect(body.locator('.legal-note')).toHaveText(hindi['legal.englishOnly']);
  const privacy = body.locator('button.legal-button[data-legal="privacy"]');
  await expect(privacy).toBeVisible();
  await expect(body.locator('a[href]')).toHaveCount(0);
  await expect(body.locator('nav')).toHaveCount(0);

  const url = page.url();
  await privacy.click();
  await expect(page.locator('#legalTitle')).toHaveText(hindi['legal.privacy']);
  expect(page.url()).toBe(url);
});
