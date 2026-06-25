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
        const c = document.querySelector('.slide[aria-current="true"] wfr-viewer')?.shadowRoot?.querySelector('canvas');
        return c instanceof HTMLCanvasElement ? Math.round(c.getBoundingClientRect().width) : 0;
      }),
    )
    .toBeGreaterThan(0);
});

const pageHtml = (page: Page): Promise<string> =>
  page.evaluate(
    () => document.querySelector('.slide[aria-current="true"] wfr-viewer')?.shadowRoot?.querySelector('[part="pages"]')?.innerHTML ?? '',
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

// Scroll the carousel track by one slide (dir -1 = prev, +1 = next). A real
// finger produces this native scroll; synthetic CDP touch does not drive
// scroll-snap reliably in headless, so we exercise our settle/commit logic by
// scrolling the track directly (the touch→scroll mapping itself is the browser's
// job, verified on-device).
const pageByScroll = async (page: Page, dir: -1 | 1): Promise<void> => {
  await page
    .locator(SEL.track)
    .evaluate((t, d) => t.scrollBy({ left: d * t.clientWidth, behavior: 'instant' }), dir);
};

// A real horizontal touch swipe over the content (dir -1 = left/next, +1 =
// right/prev). The gesture must chain from the content surface to the carousel
// track — if the surface contains the overscroll, this silently does nothing.
const swipeContent = async (page: Page, dir: -1 | 1): Promise<void> => {
  const box = await page.locator(SEL.surface).boundingBox();
  const y = (box?.y ?? 0) + (box?.height ?? 0) / 2;
  const cx = (box?.x ?? 0) + (box?.width ?? 0) / 2;
  const start = cx - dir * 130;
  const end = cx + dir * 130;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: start, y }] });
  for (let i = 1; i <= 12; i += 1) {
    const x = start + ((end - start) * i) / 12;
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

test('carousel: scrolling the track pages between files in the same dialog', async ({ page }) => {
  await open(page, 'readme.md');

  // Scroll to the next slide → commits to the next file, no document navigation.
  await markNav(page);
  await pageByScroll(page, 1);
  await expect(page).toHaveURL(/\/viewer\/notes$/);
  await expect(page.locator('#viewer-title')).toHaveText('notes.txt');
  expect(await navMarkSurvived(page)).toBe(true);

  // Scroll back → previous file.
  await pageByScroll(page, -1);
  await expect(page).toHaveURL(/\/viewer\/readme$/);
  await expect(page.locator('#viewer-title')).toHaveText('readme.md');
});

test('mobile: a horizontal swipe over the content pages the carousel', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'touch-only behaviour');
  await open(page, 'readme.md');
  await markNav(page);

  // Swipe left → next file. This only works if the content surface chains its
  // horizontal overscroll to the carousel track.
  await swipeContent(page, -1);
  await expect(page).toHaveURL(/\/viewer\/notes$/);
  await expect(page.locator('#viewer-title')).toHaveText('notes.txt');
  expect(await navMarkSurvived(page)).toBe(true);

  // Swipe right → previous file.
  await swipeContent(page, 1);
  await expect(page).toHaveURL(/\/viewer\/readme$/);
  await expect(page.locator('#viewer-title')).toHaveText('readme.md');
});

// The carousel's invariant: the slide centred in the viewport must be the
// current file — its dataset id, the title and the URL all agree — and it must
// be fully opaque (on a snap point, not the dimmed off-snap state). Returns the
// mismatch info so a failing assert is legible.
const carouselState = (page: Page): Promise<{
  centered: string | undefined;
  current: string | undefined;
  opacity: number;
}> =>
  page.evaluate(() => {
    const track = document.getElementById('track');
    const mid = (track?.scrollLeft ?? 0) + (track?.clientWidth ?? 0) / 2;
    let centered: HTMLElement | undefined;
    let best = Number.POSITIVE_INFINITY;
    for (const sec of [...(track?.children ?? [])]) {
      if (!(sec instanceof HTMLElement) || sec.hidden) continue;
      const d = Math.abs(sec.offsetLeft + sec.clientWidth / 2 - mid);
      if (d < best) {
        best = d;
        centered = sec;
      }
    }
    const cur = [...(track?.children ?? [])].find(
      (s) => s instanceof HTMLElement && s.getAttribute('aria-current') === 'true',
    );
    const viewer = centered?.querySelector('wfr-viewer');
    return {
      centered: centered?.dataset['fileId'],
      current: cur instanceof HTMLElement ? cur.dataset['fileId'] : undefined,
      opacity: viewer ? Number.parseFloat(getComputedStyle(viewer).opacity) : 0,
    };
  });

test('mobile: title/content stay in sync across several swipes', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'touch-only behaviour');
  await open(page, 'readme.md');
  const ids = ['notes', 'sales', 'logo'];
  for (const id of ids) {
    await swipeContent(page, -1);
    await expect(page).toHaveURL(new RegExp(`/viewer/${id}$`));
    // The centred slide, the aria-current marker and the URL must all agree,
    // and the centred pane must be fully opaque (settled on a snap point). Poll
    // so the scroll-driven opacity has a frame to settle under parallel load.
    await expect.poll(async () => (await carouselState(page)).centered).toBe(id);
    const st = await carouselState(page);
    expect(st.current).toBe(id);
    expect(st.opacity).toBeGreaterThan(0.9);
  }
});

test('recentre is visually neutral at a snap point (no jerk)', async ({ page }) => {
  // Land on exact snap offsets (what a real device does after a swipe) and check
  // the committed slide does not jump on screen during the recentre.
  await open(page, 'readme.md');
  const pageToNeighbour = async (id: string): Promise<number> => {
    // Sample the centred slide's on-screen X each frame while the track scrolls
    // by one slide; return the largest single-frame jump (a neutral recentre
    // keeps it continuous). All in one evaluate — no shared globals.
    const jump = await page.evaluate(async () => {
      const track = document.getElementById('track');
      if (!track) return -1;
      const samples: number[] = [];
      let on = true;
      const tick = (): void => {
        const c = [...track.children].find(
          (s) => s instanceof HTMLElement && s.getAttribute('aria-current') === 'true',
        );
        if (c instanceof HTMLElement) samples.push(Math.round(c.getBoundingClientRect().left));
        if (on) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      track.scrollBy({ left: track.clientWidth, behavior: 'instant' });
      await new Promise((resolve) => setTimeout(resolve, 500));
      on = false;
      let max = 0;
      for (let i = 1; i < samples.length; i += 1) {
        max = Math.max(max, Math.abs(samples[i] - samples[i - 1]));
      }
      return max;
    });
    await expect(page).toHaveURL(new RegExp(`/viewer/${id}$`));
    return jump;
  };
  expect(await pageToNeighbour('notes')).toBeLessThan(30);
  expect(await pageToNeighbour('sales')).toBeLessThan(30);
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

test('horizontally-scrollable content scrolls independently of the carousel', async ({ page }) => {
  // Narrow viewport so the CSV table is wider than its card (horizontal scroll).
  await page.setViewportSize({ width: 360, height: 640 });
  await open(page, 'sales.csv');
  const card = page.locator(SEL.page);
  // Precondition: the card can actually scroll horizontally.
  expect(await card.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeGreaterThan(2);

  // Scrolling the wide content does not page (the browser scrolls the inner
  // element under the finger before the carousel track).
  await card.evaluate((el) => el.scrollBy({ left: 9999 }));
  expect(await card.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  await expect(page).toHaveURL(/\/viewer\/sales$/);

  // The carousel still pages via the track.
  await pageByScroll(page, 1);
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

test('deep-linking to a file opens the viewer and reveals the landing', async ({ page }) => {
  await page.goto('/viewer/readme');
  // The dialog opens with content; the landing must not be left hidden.
  await expect(page.locator(SEL.dialog)).toBeVisible();
  await expect(page.locator(SEL.page).first()).toBeVisible();
  const stillBooting = await page.evaluate(() =>
    document.documentElement.hasAttribute('data-wfr-boot'),
  );
  expect(stillBooting).toBe(false);
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
  await page.locator('#settings-panel select').selectOption('source');

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
