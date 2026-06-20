import { test, expect, chromium } from '@playwright/test';
import { playAudit } from 'playwright-lighthouse';
import { SEL } from './selectors';

// Audit the local production preview by default; point at prod with LH_URL.
const URL = process.env['LH_URL'] ?? 'http://localhost:4321/';
const DEBUG_PORT = 9333;

test.describe('lighthouse', () => {
  test('scores 100 across performance, a11y, best-practices and SEO', async ({}, testInfo) => {
    // The audit emulates the device internally, so run it once (desktop project).
    test.skip(testInfo.project.name !== 'desktop', 'runs once on desktop');

    const context = await chromium.launchPersistentContext('', {
      args: [`--remote-debugging-port=${DEBUG_PORT}`],
    });
    try {
      const page = await context.newPage();
      await page.goto(URL);
      await page.locator(SEL.grid).waitFor();

      await playAudit({
        page,
        port: DEBUG_PORT,
        thresholds: {
          performance: 100,
          accessibility: 100,
          'best-practices': 100,
          seo: 100,
        },
        config: {
          extends: 'lighthouse:default',
          settings: {
            formFactor: 'desktop',
            throttlingMethod: 'provided',
            screenEmulation: { mobile: false, disabled: true },
          },
        },
      });
    } finally {
      await context.close();
    }
    expect(true).toBe(true);
  });
});
