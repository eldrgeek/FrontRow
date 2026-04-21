import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: process.env.BASE_URL || 'https://frontrowtheater.netlify.app',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    permissions: ['camera', 'microphone'],
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
