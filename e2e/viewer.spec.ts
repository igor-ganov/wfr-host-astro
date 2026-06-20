import { test, expect, type Page } from '@playwright/test';
import { SEL, FILE_NAMES } from './selectors';

const openFile = async (page: Page, name: string): Promise<void> => {
  await page.getByRole('button', { name }).click();
  await expect(page.locator(SEL.dialog)).toBeVisible();
  // Provider content is painted asynchronously; wait for the first page.
  await expect(page.locator(SEL.page).first()).toBeVisible();
};

const horizontalOverflow = (page: Page): Promise<number> =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  // Grid hydration renders one accessible button per file.
  await expect(page.getByRole('button', { name: 'sales.csv' })).toBeVisible();
});

test('grid shows a pictogram image per file', async ({ page }) => {
  const imgs = page.locator(SEL.tileImg);
  await expect(imgs).toHaveCount(FILE_NAMES.length);
  const missingSrc = await imgs.evaluateAll((els) =>
    els.filter((el) => !(el instanceof HTMLImageElement) || el.getAttribute('src') === null).length,
  );
  expect(missingSrc).toBe(0);
});

test('no horizontal overflow on the grid or in the viewer', async ({ page }) => {
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  await openFile(page, 'sales.csv');
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
});

test('content scrolls inside the surface, not the page body', async ({ page }) => {
  await page.setViewportSize({ width: 380, height: 430 });
  await openFile(page, 'readme.md');

  const metrics = await page.evaluate(() => {
    const viewer = document.querySelector('#viewer');
    const surface = viewer?.shadowRoot?.querySelector('[part="surface"]');
    if (!(surface instanceof HTMLElement)) return undefined;
    surface.scrollTop = 9999;
    return {
      scrollable: surface.scrollHeight > surface.clientHeight,
      scrolled: surface.scrollTop,
      bodyOverflowY: getComputedStyle(document.body).overflowY,
    };
  });

  expect(metrics?.scrollable).toBe(true);
  expect(metrics?.scrolled).toBeGreaterThan(0);
  // Background must not be the scroll container while the modal is open.
  expect(metrics?.bodyOverflowY).toBe('clip');
});

test('paging keeps the same dialog mounted (no flicker)', async ({ page }) => {
  await openFile(page, 'readme.md');
  const dialog = await page.locator(SEL.dialog).elementHandle();
  expect(dialog).not.toBeNull();

  await page.locator(SEL.surface).focus();
  await page.keyboard.press('ArrowRight');

  await expect(page).toHaveURL(/\/viewer\/notes$/);
  await expect(page.locator(SEL.dialog)).toBeVisible();

  // The very same dialog node survived the route change and stayed open.
  const survived = await dialog?.evaluate((el) => el.isConnected && el instanceof HTMLDialogElement && el.open);
  expect(survived).toBe(true);
});

test('closing the viewer does not shift the page layout', async ({ page }) => {
  const heading = page.getByRole('heading', { level: 1, name: 'Web File Reader' });
  const before = await heading.boundingBox();

  await openFile(page, 'sales.csv');
  await page.getByRole('link', { name: 'Close viewer' }).click();
  await expect(page).toHaveURL(/:4321\/$/);
  await expect(page.locator(SEL.dialog)).toBeHidden();

  const after = await heading.boundingBox();
  expect(before).not.toBeNull();
  expect(after).not.toBeNull();
  expect(Math.abs((after?.x ?? 0) - (before?.x ?? 0))).toBeLessThanOrEqual(0.5);
  expect(Math.abs((after?.y ?? 0) - (before?.y ?? 0))).toBeLessThanOrEqual(0.5);
});
