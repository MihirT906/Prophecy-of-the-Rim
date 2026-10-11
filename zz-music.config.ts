import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4199', viewport: { width: 1280, height: 800 } },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel: process.env.PLAYWRIGHT_CHANNEL } }],
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4199',
    url: 'http://127.0.0.1:4199',
    reuseExistingServer: false,
  },
});
