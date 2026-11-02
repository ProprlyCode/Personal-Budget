// E2E tests drive index.html straight from disk (file://): the app has no
// build step or server. Firebase is blocked in most tests so the app runs in
// its local-only mode; market data is mocked.
const { defineConfig, devices } = require("@playwright/test");
module.exports = defineConfig({
  testDir: "./e2e",
  timeout: 60000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { ...devices["Desktop Chrome"], trace: "retain-on-failure" },
  projects: [{ name: "chromium" }]
});
