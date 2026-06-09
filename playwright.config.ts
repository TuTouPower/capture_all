import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './tests',
    outputDir: 'artifacts/test-results',
    timeout: 120_000,
    expect: { timeout: 15_000 },
    use: {
        actionTimeout: 15_000,
        trace: 'on-first-retry',
    },
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
            name: 'e2e-ext',
            testMatch: 'e2e-{baidu,states,labels,stop,ui-audit,export,realtime-detail,consistency,dashboard-list,detail-tabs,toutiao,qq,sina,logging}.spec.ts',
            fullyParallel: false,
            workers: 1,
            retries: 0,
            use: {
                headless: false,
                launchOptions: {
                    args: ['--no-first-run', '--no-default-browser-check', '--disable-gpu'],
                },
            },
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
            testMatch: 'e2e-mcp*.spec.ts',
            use: {
                headless: false,
                launchOptions: {
                    args: ['--no-first-run', '--no-default-browser-check'],
                },
            },
        },
        {
            name: 'e2e-p1',
            testMatch: 'e2e-{concurrent,network,console-errors,xss,mcp-full,theme-i18n}.spec.ts',
            fullyParallel: false,
            workers: 1,
            retries: 0,
            use: {
                headless: false,
                launchOptions: {
                    args: ['--no-first-run', '--no-default-browser-check', '--disable-gpu'],
                },
            },
        },
    ],
});
