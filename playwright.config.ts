import { defineConfig, devices } from '@playwright/test';

const PORT = 4321;
const baseURL = `http://localhost:${PORT}`;

// Event-driven waits only; one shared ceiling (no per-test timeout overrides).
const WAIT = Number(process.env['E2E_MAX_WAIT_MS'] ?? (process.env['CI'] ? 30000 : 10000));

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env['CI']),
  retries: 0,
  workers: process.env['CI'] ? 4 : undefined,
  reporter: 'list',
  expect: { timeout: WAIT },
  use: {
    baseURL,
    actionTimeout: WAIT,
    navigationTimeout: WAIT,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
  ],
  webServer: {
    // The libraries must already be built (bun run -F '@web-file-reader/*' build);
    // this builds the host and serves the production output.
    command: `bun run build && bun run preview --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env['CI'],
    timeout: 120000,
  },
});
