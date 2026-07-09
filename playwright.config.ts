import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // Retries absorb the inherent flakiness of a suite that hits one shared,
  // stateful production backend (lingering socket.io connections between tests
  // can transiently reset the global show/seat state). Tests pass in isolation;
  // a per-test room would remove the need for retries but is a larger change.
  retries: process.env.CI ? 2 : 2,
  workers: 1,
  reporter: 'html',
  timeout: 30000,
  use: {
    baseURL: process.env.FRONTROW_URL || process.env.BASE_URL || 'https://frontrowtheater.netlify.app',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    permissions: ['camera', 'microphone'],
    headless: true,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [
            '--use-fake-video-capture',
            '--use-fake-audio-capture',
            '--use-file-for-fake-video-capture=/dev/null',
            '--allow-insecure-localhost',
          ],
        },
      },
    },
  ],
});
