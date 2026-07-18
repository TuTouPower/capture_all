import { defineConfig } from '@playwright/test';

const loopback_hosts = ['127.0.0.1', 'localhost'];
const configured_no_proxy = [
    process.env.NO_PROXY || '',
    process.env.no_proxy || '',
].flatMap((value) => value.split(','));
const no_proxy = Array.from(new Set([
    ...configured_no_proxy.map((value) => value.trim()).filter(Boolean),
    ...loopback_hosts,
])).join(',');

process.env.NO_PROXY = no_proxy;
process.env.no_proxy = no_proxy;

export default defineConfig({
    testDir: './tests/e2e',
    outputDir: 'artifacts/test-results',
    timeout: 120_000,
    expect: { timeout: 15_000 },
    use: {
        actionTimeout: 15_000,
        trace: 'on-first-retry',
    },
    webServer: [
        {
            command: 'npm run serve:e2e',
            url: 'http://127.0.0.1:4174/src/extension/popup/popup.html',
            reuseExistingServer: true,
            timeout: 120000,
        },
        {
            command: 'npm run test:e2e:server',
            url: 'http://127.0.0.1:17832/test-page.html',
            reuseExistingServer: true,
            timeout: 120000,
        },
    ],
    projects: [
        {
            name: 'e2e',
            testMatch: 'e2e.spec.ts',
            use: { headless: true },
        },
        {
            name: 'e2e-ext',
            testMatch: 'e2e-{baidu,states,labels,stop,ui-audit,export,realtime-detail,consistency,dashboard-list,detail-tabs,toutiao,qq,sina,logging,T0001*}.spec.ts',
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
            name: 'e2e-t0001',
            testDir: './tests/e2e/T0001',
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
            name: 'e2e-t0003',
            testDir: './tests/e2e/T0003',
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
            name: 'e2e-cdp-capture',
            testMatch: 'e2e-cdp-capture.spec.ts',
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
        {
            name: 'e2e-streaming',
            testMatch: 'e2e-{websocket-capture,streaming-capture}.spec.ts',
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
