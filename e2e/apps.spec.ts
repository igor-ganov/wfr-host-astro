import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('section.apps')).toBeVisible();
});

test('apps section lists live demos and code-only projects', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Apps & Demos' })).toBeVisible();
  await expect(page.locator('.apps-grid .demo-stage')).toHaveCount(4);
  await expect(page.locator('.app-card.is-code-only')).toHaveCount(4);
  // Every card exposes a Source link.
  const sources = page.locator('.app-links a', { hasText: 'Source' });
  expect(await sources.count()).toBeGreaterThanOrEqual(8);
});

test('demos are click-to-load: no iframe ships until requested', async ({ page }) => {
  // Zero embedded frames on initial load (keeps the landing light).
  await expect(page.locator('.demo-frame')).toHaveCount(0);

  await page.locator('.demo-stage .demo-play').first().click();

  const frame = page.locator('.demo-frame').first();
  await expect(frame).toHaveCount(1);
  await expect(frame).toHaveAttribute('src', /igor-ganov\.github\.io/);
  await expect(frame).toHaveAttribute('loading', 'lazy');
});
