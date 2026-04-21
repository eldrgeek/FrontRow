import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
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
