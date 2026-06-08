import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './tests',
    outputDir: 'artifacts/test-results',
    timeout: 60000,
    webServer: {
        command: 'npm run serve:e2e',
        url: 'http://127.0.0.1:4174/src/popup/popup.html',
        reuseExistingServer: true,
        timeout: 120000,
    },
    projects: [
        {
            name: 'e2e',
            testMatch: 'e2e.spec.ts',
            use: { headless: true },
        },
        {
            name: 'e2e-real',
            testMatch: 'e2e-real.spec.ts',
            use: {
                headless: false,
                launchOptions: {
                    args: ['--no-first-run', '--no-default-browser-check'],
                },
            },
        },
        {
            name: 'e2e-9223',
            testMatch: 'e2e-9223.spec.ts',
            use: {
                headless: false,
                launchOptions: {
                    args: ['--no-first-run', '--no-default-browser-check'],
                },
            },
        },
        {
            name: 'e2e-mcp',
            testMatch: 'e2e-mcp.spec.ts',
            use: {
                headless: false,
                launchOptions: {
                    args: ['--no-first-run', '--no-default-browser-check'],
                },
            },
        }
    ]
});
