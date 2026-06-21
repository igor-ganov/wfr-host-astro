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

test('rendered media fits the viewport width', async ({ page }) => {
  const viewportWidth = await page.evaluate(() => document.documentElement.clientWidth);

  await openFile(page, 'logo.svg');
  const imageWidth = await page.evaluate(() => {
    const img = document.querySelector('#viewer')?.shadowRoot?.querySelector('img');
    return img instanceof HTMLImageElement ? img.getBoundingClientRect().width : -1;
  });
  expect(imageWidth).toBeGreaterThan(0);
  expect(imageWidth).toBeLessThanOrEqual(viewportWidth);

  await page.getByRole('link', { name: 'Close viewer' }).click();
  await expect(page.locator(SEL.dialog)).toBeHidden();

  await openFile(page, 'doc.pdf');
  const measureCanvas = (): Promise<number> =>
    page.evaluate(() => {
      const canvas = document.querySelector('#viewer')?.shadowRoot?.querySelector('canvas');
      return canvas instanceof HTMLCanvasElement ? canvas.getBoundingClientRect().width : 0;
    });
  // pdf.js paints the canvas asynchronously — poll until it has a width.
  await expect.poll(measureCanvas).toBeGreaterThan(0);
  expect(await measureCanvas()).toBeLessThanOrEqual(viewportWidth);
});

test('no horizontal overflow on the grid or in the viewer', async ({ page }) => {
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  await openFile(page, 'sales.csv');
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
});

test('content scrolls inside the surface, not the page body', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await openFile(page, 'readme.md');

  const surface = page.locator(SEL.surface);
  // The surface (not the body) is the working scroll container on a phone.
  const before = await surface.evaluate((el) => ({
    scrollable: el.scrollHeight > el.clientHeight,
    bodyOverflowY: getComputedStyle(document.body).overflowY,
    bodyScrollable: document.body.scrollHeight > document.body.clientHeight,
  }));
  expect(before.scrollable).toBe(true);
  // Background must not be the scroll container while the modal is open.
  expect(before.bodyOverflowY).toBe('clip');

  // Programmatic scroll moves the surface (the touch scroll container).
  await surface.evaluate((el) => {
    el.scrollTop = 9999;
  });
  await expect.poll(() => surface.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);

  // A real input gesture over the surface also moves it (and not the body).
  await surface.evaluate((el) => {
    el.scrollTop = 0;
  });
  const box = await surface.boundingBox();
  expect(box).not.toBeNull();
  const cx = (box?.x ?? 0) + (box?.width ?? 0) / 2;
  const cy = (box?.y ?? 0) + (box?.height ?? 0) / 2;
  if (testInfo.project.name === 'mobile') {
    // Real touch swipe via CDP — the browser scrolls the surface for real.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: cx, y: cy + 200 }],
    });
    for (let y = cy + 150; y >= cy - 200; y -= 50) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx, y }] });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
  } else {
    await page.mouse.move(cx, cy);
    await page.mouse.wheel(0, 600);
  }
  await expect.poll(() => surface.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);

  const bodyTop = await page.evaluate(
    () => document.documentElement.scrollTop || document.body.scrollTop,
  );
  expect(bodyTop).toBe(0);
});

test('paging keeps the same dialog mounted (no flicker, no nav)', async ({ page }) => {
  await openFile(page, 'readme.md');
  const dialog = await page.locator(SEL.dialog).elementHandle();
  expect(dialog).not.toBeNull();
  await page.evaluate(() => Reflect.set(globalThis, '__navmark', true));

  await page.locator(SEL.viewer).hover();
  await page.getByRole('button', { name: 'Next' }).click();

  await expect(page).toHaveURL(/\/viewer\/notes$/);
  await expect(page.locator('#viewer-title')).toHaveText('notes.txt');
  await expect(page.locator(SEL.dialog)).toBeVisible();

  // No document navigation, and the very same dialog node stayed open.
  expect(await page.evaluate(() => Reflect.get(globalThis, '__navmark') === true)).toBe(true);
  const survived = await dialog?.evaluate(
    (el) => el.isConnected && el instanceof HTMLDialogElement && el.open,
  );
  expect(survived).toBe(true);
});

test('opening a file does not shift the masthead heading', async ({ page }) => {
  // Scope to the masthead; provider content may render its own <h1>.
  const heading = page.locator('main.page .masthead h1');
  const before = await heading.boundingBox();
  await openFile(page, 'readme.md');
  const after = await heading.boundingBox();
  expect(before).not.toBeNull();
  expect(after).not.toBeNull();
  expect(Math.abs((after?.x ?? 0) - (before?.x ?? 0))).toBeLessThanOrEqual(0.5);
  expect(Math.abs((after?.y ?? 0) - (before?.y ?? 0))).toBeLessThanOrEqual(0.5);
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
