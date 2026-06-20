import { test, expect, type Page } from '@playwright/test';
import { SEL } from './selectors';

const open = async (page: Page, name: string): Promise<void> => {
  await page.getByRole('button', { name }).click();
  await expect(page.locator(SEL.dialog)).toBeVisible();
  await expect(page.locator(SEL.page).first()).toBeVisible();
};

const revealNav = async (page: Page): Promise<void> => {
  // Controls auto-hide; a pointer move over the viewer reveals them.
  await page.locator(SEL.viewer).hover();
};

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'readme.md' })).toBeVisible();
});

test('renders real content for each provider', async ({ page }) => {
  await open(page, 'readme.md');
  await expect(page.locator(`${SEL.page} h1`)).toHaveText('Web File Reader');

  await page.getByRole('link', { name: 'Close viewer' }).click();
  await open(page, 'sales.csv');
  await expect(page.locator(`${SEL.page} table`)).toBeVisible();
  expect(await page.locator(`${SEL.page} tbody tr`).count()).toBeGreaterThan(3);

  await page.getByRole('link', { name: 'Close viewer' }).click();
  await open(page, 'logo.svg');
  await expect(page.locator(`${SEL.page} img`)).toBeVisible();

  await page.getByRole('link', { name: 'Close viewer' }).click();
  await open(page, 'doc.pdf');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const c = document.querySelector('#viewer')?.shadowRoot?.querySelector('canvas');
        return c instanceof HTMLCanvasElement ? Math.round(c.getBoundingClientRect().width) : 0;
      }),
    )
    .toBeGreaterThan(0);
});

test('opening a file does not leave a control focused (no stray focus ring)', async ({ page }) => {
  await open(page, 'readme.md');
  const focusedId = await page.evaluate(() => document.activeElement?.id ?? '');
  expect(focusedId).toBe('viewer-dialog');
});

test('Next button pages to the next file and swaps content', async ({ page }) => {
  await open(page, 'readme.md');
  await revealNav(page);
  await page.getByRole('button', { name: 'Next' }).click();

  await expect(page).toHaveURL(/\/viewer\/notes$/);
  await expect(page.locator('#viewer-title')).toHaveText('notes.txt');
  await expect(page.locator(SEL.dialog)).toBeVisible();
});

test('changing a setting re-renders the viewer', async ({ page }) => {
  await open(page, 'readme.md');
  // Rendered markdown first.
  await expect(page.locator(`${SEL.page} h1`)).toBeVisible();

  await page.locator(SEL.settingsBtn).click();
  await page.locator(`${SEL.viewer} select`).selectOption('source');

  // Source view shows the raw markdown in a <pre>, no rendered heading.
  await expect(page.locator(`${SEL.page} pre`)).toBeVisible();
  await expect(page.locator(`${SEL.page} h1`)).toHaveCount(0);
});

test('fullscreen control: hidden on mobile, present on desktop', async ({ page }, testInfo) => {
  await open(page, 'readme.md');
  const fs = page.locator(SEL.fsBtn);
  if (testInfo.project.name === 'mobile') {
    await expect(fs).toBeHidden();
  } else {
    await expect(fs).toBeVisible();
  }
});

test('close returns to the grid', async ({ page }) => {
  await open(page, 'sales.csv');
  await page.getByRole('link', { name: 'Close viewer' }).click();
  await expect(page.locator(SEL.dialog)).toBeHidden();
  await expect(page.getByRole('button', { name: 'sales.csv' })).toBeVisible();
});
