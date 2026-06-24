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

const navVisible = (page: Page): Promise<boolean> =>
  page.locator('#nav').evaluate((el) => el.hasAttribute('visible'));

// Dispatch a real touch tap at the centre of the scroll surface via CDP.
const tapSurface = async (page: Page): Promise<void> => {
  const box = await page.locator(SEL.surface).boundingBox();
  const x = (box?.x ?? 0) + (box?.width ?? 0) / 2;
  const y = (box?.y ?? 0) + (box?.height ?? 0) / 2;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
};

// Dispatch a horizontal swipe across the surface (dir -1 = left/next, +1 = right/prev).
const swipeSurface = async (page: Page, dir: -1 | 1): Promise<void> => {
  const box = await page.locator(SEL.surface).boundingBox();
  const y = (box?.y ?? 0) + (box?.height ?? 0) / 2;
  const cx = (box?.x ?? 0) + (box?.width ?? 0) / 2;
  const from = cx - dir * 100;
  const to = cx + dir * 100;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from, y }] });
  for (let i = 1; i <= 6; i += 1) {
    const x = from + ((to - from) * i) / 6;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
};

// Dispatch a mostly-vertical drag (a scroll gesture) with slight horizontal drift.
const dragVertical = async (page: Page): Promise<void> => {
  const box = await page.locator(SEL.surface).boundingBox();
  const cx = (box?.x ?? 0) + (box?.width ?? 0) / 2;
  const y0 = (box?.y ?? 0) + (box?.height ?? 0) * 0.75;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: y0 }] });
  for (let i = 1; i <= 8; i += 1) {
    // Vertical travel dominates, but drift horizontally too (the case that used
    // to mis-fire a page turn).
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: cx + i * 8, y: y0 - i * 28 }],
    });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
};

test('mobile: a single tap toggles the paging controls', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'touch-only behaviour');
  // Open via a real touch tap: a mouse .click() would leave the cursor hovering
  // the viewer after the dialog opens (pointerenter:mouse) and reveal controls —
  // an emulation artifact that never happens on a touch device.
  await page.getByRole('button', { name: 'readme.md' }).tap();
  await expect(page.locator(SEL.dialog)).toBeVisible();
  await expect(page.locator(SEL.page).first()).toBeVisible();
  // Controls start hidden; a tap shows them, a second tap hides them.
  await expect.poll(() => navVisible(page)).toBe(false);
  await tapSurface(page);
  await expect.poll(() => navVisible(page)).toBe(true);
  await tapSurface(page);
  await expect.poll(() => navVisible(page)).toBe(false);
});

test('mobile: horizontal swipe pages between files', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'touch-only behaviour');
  await open(page, 'readme.md');

  // Swipe left → next file, in the same dialog (no navigation).
  await markNav(page);
  await swipeSurface(page, -1);
  await expect(page).toHaveURL(/\/viewer\/notes$/);
  await expect(page.locator('#viewer-title')).toHaveText('notes.txt');
  expect(await navMarkSurvived(page)).toBe(true);

  // Swipe right → previous file.
  await swipeSurface(page, 1);
  await expect(page).toHaveURL(/\/viewer\/readme$/);
  await expect(page.locator('#viewer-title')).toHaveText('readme.md');
});

test('mobile: a vertical scroll gesture does not page', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'touch-only behaviour');
  await page.setViewportSize({ width: 360, height: 640 });
  await open(page, 'readme.md');
  // A mostly-vertical drag (with horizontal drift) must keep the same file.
  await dragVertical(page);
  await page.waitForTimeout(300);
  await expect(page).toHaveURL(/\/viewer\/readme$/);
  await expect(page.locator('#viewer-title')).toHaveText('readme.md');
});

test('mobile: swiping horizontally-scrollable content scrolls it, then pages at the edge', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'touch-only behaviour');
  // Narrow viewport so the CSV table is wider than its card (horizontal scroll).
  await page.setViewportSize({ width: 360, height: 640 });
  await open(page, 'sales.csv');
  const cardScrollLeft = (): Promise<number> => page.locator(SEL.page).evaluate((el) => el.scrollLeft);
  // Precondition: the card can actually scroll horizontally.
  const maxScroll = await page.locator(SEL.page).evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(maxScroll).toBeGreaterThan(2);

  // First horizontal swipe scrolls the table — it must NOT page.
  await swipeSurface(page, -1);
  await page.waitForTimeout(200);
  expect(await cardScrollLeft()).toBeGreaterThan(0);
  await expect(page).toHaveURL(/\/viewer\/sales$/);

  // Now at the right edge: a further swipe-left can't scroll, so it pages.
  await swipeSurface(page, -1);
  await expect(page).toHaveURL(/\/viewer\/logo$/);
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
