import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './tests',
    timeout: 60000,
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
            use: { headless: true },
        }
    ]
});
