import { beforeEach, expect, it, vi } from 'vitest';

const panels_create_mock = vi.fn();

vi.mock('../src/extension/background/app_log_storage', () => ({
    get_app_log_transport: () => ({
        write: vi.fn(),
        flush: vi.fn(),
        get_entries: vi.fn(),
        count: vi.fn(),
        clear: vi.fn(),
    }),
}));

beforeEach(() => {
    vi.resetModules();
    panels_create_mock.mockReset();
    Object.defineProperty(globalThis, 'chrome', {
        configurable: true,
        value: {
            devtools: {
                panels: {
                    create: panels_create_mock,
                },
            },
        },
    });
});

it('registers the Capture All DevTools panel', async () => {
    await import('../src/extension/devtools/devtools');

    expect(panels_create_mock).toHaveBeenCalledOnce();
    expect(panels_create_mock).toHaveBeenCalledWith(
        'Capture All',
        'assets/icons/icon48.png',
        'src/extension/dashboard/dashboard.html',
    );
});
