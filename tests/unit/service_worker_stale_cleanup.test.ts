import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const update_capture = vi.hoisted(() => vi.fn());
const log_write = vi.hoisted(() => vi.fn());
const storage_get = vi.hoisted(() => vi.fn());
const storage_set = vi.hoisted(() => vi.fn());

vi.mock('../../src/extension/background/storage', async (import_original) => ({
    ...await import_original<typeof import('../../src/extension/background/storage')>(),
    update_capture,
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
            onInstalled: add_listener(),
            onMessage: add_listener(),
        },
        storage: {
            local: {
                get: storage_get,
                set: storage_set,
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

function get_cleanup_errors(): Array<Record<string, unknown>> {
    return log_write.mock.calls
        .map(([entry]) => entry as Record<string, unknown>)
        .filter((entry) => entry.message === 'Stale capture cleanup failed');
}

async function import_and_run_cleanup(): Promise<void> {
    await import('../../src/extension/background/service_worker');
    await vi.runAllTimersAsync();
}

beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.clearAllMocks();
    install_chrome_mock();
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('service worker stale capture cleanup', () => {
    test('logs storage get failure without unhandled rejection', async () => {
        storage_get.mockRejectedValue(new Error('storage get failed'));

        await expect(import_and_run_cleanup()).resolves.toBeUndefined();

        expect(get_cleanup_errors()).toEqual([
            expect.objectContaining({
                level: 'error',
                details: expect.objectContaining({
                    name: 'Error',
                    message: 'storage get failed',
                }),
            }),
        ]);
    });

    test('logs capture update failure without resetting stale state', async () => {
        storage_get.mockResolvedValue({
            is_capturing: true,
            current_capture: {
                capture_id: 'capture_1',
                started_at: new Date(0).toISOString(),
            },
        });
        update_capture.mockRejectedValue(new Error('update failed'));

        await expect(import_and_run_cleanup()).resolves.toBeUndefined();

        expect(storage_set).not.toHaveBeenCalled();
        expect(get_cleanup_errors()).toEqual([
            expect.objectContaining({
                details: expect.objectContaining({
                    name: 'Error',
                    message: 'update failed',
                }),
            }),
        ]);
    });

    test('logs storage set failure without unhandled rejection', async () => {
        storage_get.mockResolvedValue({
            is_capturing: true,
            current_capture: null,
        });
        storage_set.mockRejectedValue(new Error('storage set failed'));

        await expect(import_and_run_cleanup()).resolves.toBeUndefined();

        expect(get_cleanup_errors()).toEqual([
            expect.objectContaining({
                details: expect.objectContaining({
                    name: 'Error',
                    message: 'storage set failed',
                }),
            }),
        ]);
    });

    test('cleans stale state successfully without error log', async () => {
        storage_get.mockResolvedValue({
            is_capturing: true,
            current_capture: null,
        });
        storage_set.mockResolvedValue(undefined);

        await import_and_run_cleanup();

        expect(storage_set).toHaveBeenCalledWith({
            is_capturing: false,
            current_capture: null,
        });
        expect(get_cleanup_errors()).toHaveLength(0);
    });
});
