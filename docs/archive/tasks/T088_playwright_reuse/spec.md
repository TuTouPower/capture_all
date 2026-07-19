# T088 Playwright reuseExistingServer CI
playwright.config.ts: reuseExistingServer 改为 !process.env.CI（CI 强制不复用）。
