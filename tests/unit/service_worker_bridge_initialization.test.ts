import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const load_user_config = vi.hoisted(() => vi.fn());
const log_write = vi.hoisted(() => vi.fn());
const start_bridge_client = vi.hoisted(() => vi.fn());
const storage_get = vi.hoisted(() => vi.fn());

vi.mock('../../src/shared/user_config', () => ({
    load_user_config,
}));

vi.mock('../../src/extension/background/agent_bridge_client', () => ({
    start_bridge_client,
    stop_bridge_client: vi.fn(),
}));

vi.mock('../../src/extension/background/app_log_storage', () => ({
    get_app_log_transport: () => ({
        write: log_write,
        flush: vi.fn(),
        get_entries: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
        clear: vi.fn(),
    }),
}));

vi.mock('../../src/extension/background/keepalive', () => ({
    setup_keepalive_listener: vi.fn(),
    start_keepalive: vi.fn(),
    stop_keepalive: vi.fn(),
}));

function add_listener(): { addListener: ReturnType<typeof vi.fn> } {
    return { addListener: vi.fn() };
}

function install_chrome_mock(): void {
    vi.stubGlobal('self', {
        addEventListener: vi.fn(),
    });
    vi.stubGlobal('chrome', {
        debugger: {},
        runtime: {
            getManifest: vi.fn(() => ({ version: '0.1.0' })),
            onInstalled: add_listener(),
            onMessage: add_listener(),
        },
        storage: {
            local: {
                get: storage_get,
                set: vi.fn(),
            },
        },
        tabs: {
            onActivated: add_listener(),
            onRemoved: add_listener(),
            onCreated: add_listener(),
            onUpdated: add_listener(),
        },
    });
}

function get_initialization_errors(): Array<Record<string, unknown>> {
    return log_write.mock.calls
        .map(([entry]) => entry as Record<string, unknown>)
        .filter((entry) => entry.message === 'Agent bridge initialization failed');
}

async function import_and_run_initialization(): Promise<void> {
    await import('../../src/extension/background/service_worker');
    await vi.runAllTimersAsync();
}

beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.clearAllMocks();
    storage_get.mockResolvedValue({});
    install_chrome_mock();
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('service worker bridge initialization', () => {
    test('starts bridge client during normal module initialization when config is valid', async () => {
        load_user_config.mockResolvedValue({
            agent_bridge_enabled: true,
            agent_bridge_url: 'http://127.0.0.1:17831',
            agent_bridge_token: '<TEST_BRIDGE_TOKEN>',
            agent_bridge_poll_interval_ms: 1000,
            log_level: 'info',
        });

        await import_and_run_initialization();

        expect(load_user_config).toHaveBeenCalled();
        expect(start_bridge_client).toHaveBeenCalledTimes(1);
    });

    test('logs invalid bridge config without leaking token or rejecting initialization', async () => {
        const sensitive_value = ['sensitive', 'bridge', 'token'].join('_');
        load_user_config.mockResolvedValue({
            agent_bridge_enabled: true,
            agent_bridge_url: 'https://127.0.0.1:17831',
            agent_bridge_token: sensitive_value,
            agent_bridge_poll_interval_ms: 1000,
            log_level: 'info',
        });

        await expect(import_and_run_initialization()).resolves.toBeUndefined();

        expect(start_bridge_client).not.toHaveBeenCalled();
        expect(get_initialization_errors()).toEqual([
            expect.objectContaining({
                level: 'error',
                details: expect.objectContaining({
                    name: 'Error',
                    message: 'Bridge URL must use http',
                }),
            }),
        ]);
        expect(JSON.stringify(get_initialization_errors())).not.toContain(
            sensitive_value,
        );
    });
});
