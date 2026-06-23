import { test, expect, type Page } from '@playwright/test';
import { SEL } from './selectors';

// A full document navigation wipes any state we set on the live page; we mark
// the page and later assert the mark survived (proving no MPA navigation).
const markNav = (page: Page): Promise<void> =>
  page.evaluate(() => Reflect.set(globalThis, '__navmark', true));
const navMarkSurvived = (page: Page): Promise<boolean> =>
  page.evaluate(() => Reflect.get(globalThis, '__navmark') === true);

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

const pageHtml = (page: Page): Promise<string> =>
  page.evaluate(
    () => document.querySelector('#viewer')?.shadowRoot?.querySelector('[part="pages"]')?.innerHTML ?? '',
  );

test('renders content for the new providers (pdf-multi, png, fb2, docx, zip)', async ({ page }) => {
  // Multi-page PDF: more than one page surface.
  await open(page, 'report.pdf');
  await expect.poll(() => page.locator(SEL.page).count()).toBeGreaterThan(1);

  await page.getByRole('link', { name: 'Close viewer' }).click();
  await open(page, 'photo.png');
  await expect(page.locator(`${SEL.page} img`)).toBeVisible();

  await page.getByRole('link', { name: 'Close viewer' }).click();
  await open(page, 'book.fb2');
  // FB2 pages one section per page; emphasis is mapped to <em>.
  await expect.poll(() => page.locator(SEL.page).count()).toBeGreaterThan(1);
  expect(await pageHtml(page)).toContain('<em>');

  await page.getByRole('link', { name: 'Close viewer' }).click();
  await open(page, 'report.docx');
  await expect(page.locator(`${SEL.page} h1`)).toHaveText('Quarterly Report');
  expect(await pageHtml(page)).toContain('<strong>');

  await page.getByRole('link', { name: 'Close viewer' }).click();
  await open(page, 'bundle.zip');
  await expect(page.locator(`${SEL.page} table`)).toBeVisible();
  expect(await pageHtml(page)).toContain('readme.md');
});

test('the download button downloads the current file', async ({ page }) => {
  await open(page, 'sales.csv');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download file' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('sales.csv');
});

test('opening a file does not leave a control focused (no stray focus ring)', async ({ page }) => {
  await open(page, 'readme.md');
  const focusedId = await page.evaluate(() => document.activeElement?.id ?? '');
  expect(focusedId).toBe('viewer-dialog');
});

test('Next button pages to the next file in the SAME dialog (no nav, no flash)', async ({
  page,
}) => {
  await open(page, 'readme.md');
  // Mark the live document; a full navigation would wipe this flag.
  await markNav(page);
  const dialog = await page.locator(SEL.dialog).elementHandle();

  await revealNav(page);
  await page.getByRole('button', { name: 'Next' }).click();

  await expect(page).toHaveURL(/\/viewer\/notes$/);
  await expect(page.locator('#viewer-title')).toHaveText('notes.txt');
  await expect(page.locator(SEL.dialog)).toBeVisible();

  // No document navigation happened, and the very same dialog node is still open.
  expect(await navMarkSurvived(page)).toBe(true);
  const sameOpenNode = await dialog?.evaluate(
    (el) => el.isConnected && el instanceof HTMLDialogElement && el.open,
  );
  expect(sameOpenNode).toBe(true);
});

test('clicking a tile opens the viewer client-side (no document navigation)', async ({ page }) => {
  await markNav(page);
  await open(page, 'readme.md');
  await expect(page).toHaveURL(/\/viewer\/readme$/);
  expect(await navMarkSurvived(page)).toBe(true);
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
