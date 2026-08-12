// tests/sw_action_contract.test.ts
// P0.46: UI action 与 SW handler 的契约测试
// 确保 UI 发送的每个 action 都被 SW 处理，防止 action 名漂移。
// t146: action 清单收敛到 src/shared/message_contract.ts 的 UI_ACTIONS；
// UI 侧经 send_ui_message(action, payload) 发送，SW 的 case 必须覆盖全部。

import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { UI_ACTIONS } from '../../src/shared/message_contract';

const log_write = vi.hoisted(() => vi.fn());
const load_user_config = vi.hoisted(() => vi.fn());

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
vi.mock('../../src/shared/user_config', () => ({ load_user_config }));

const sw_src = readFileSync(resolve(__dirname, '../../src/extension/background/service_worker.ts'), 'utf8');

function extract_sw_cases(src: string): Set<string> {
    const cases = new Set<string>();
    const re = /case\s+'([^']+)'/g;
    let m;
    while ((m = re.exec(src)) !== null) {
        cases.add(m[1]);
    }
    return cases;
}

function add_listener(): { addListener: ReturnType<typeof vi.fn> } {
    return { addListener: vi.fn() };
}

let on_message_cb: ((msg: any, _s: any, send: (r: any) => void) => void) | undefined;

function install_chrome_mock(): void {
    vi.stubGlobal('self', { addEventListener: vi.fn() });
    vi.stubGlobal('chrome', {
        dbg: { attach: vi.fn(async () => {}), detach: vi.fn(async () => {}), sendCommand: vi.fn(async () => ({})), onEvent: { addListener: vi.fn(), removeListener: vi.fn() } },
        debugger: { attach: vi.fn(async () => {}), detach: vi.fn(async () => {}), sendCommand: vi.fn(async () => ({})), onEvent: { addListener: vi.fn(), removeListener: vi.fn() } },
        runtime: {
            getManifest: vi.fn(() => ({ version: '0.1.0' })),
            onInstalled: add_listener(),
            onMessage: { addListener: (cb: any) => { on_message_cb = cb; } },
        },
        storage: {
            local: { get: vi.fn(async () => ({})), set: vi.fn(async () => undefined) },
            onChanged: { addListener: vi.fn() },
        },
        tabs: {
            query: vi.fn(async () => [{ id: 42, url: 'https://example.com', title: 'T', windowId: 1 }]),
            get: vi.fn(async () => ({ id: 42, url: 'https://example.com' })),
            sendMessage: vi.fn(async () => undefined),
            onActivated: add_listener(),
            onRemoved: add_listener(),
            onCreated: add_listener(),
            onUpdated: add_listener(),
        },
        webRequest: {
            onBeforeRequest: add_listener(),
            onBeforeSendHeaders: add_listener(),
            onHeadersReceived: add_listener(),
            onCompleted: add_listener(),
            onErrorOccurred: add_listener(),
        },
        cookies: { onChanged: add_listener(), getAll: vi.fn(async () => []) },
    });
}

function send_message(msg: Record<string, unknown>): Promise<any> {
    if (!on_message_cb) throw new Error('no listener');
    return new Promise((resolve) => on_message_cb!(msg, {}, resolve));
}

describe('P0.46: SW action contract（UI_ACTIONS 门禁）', () => {
    const sw_cases = extract_sw_cases(sw_src);

    it('every UI_ACTIONS action is handled by SW', () => {
        for (const action of UI_ACTIONS) {
            expect(sw_cases.has(action), `UI action "${action}" not found in SW handler cases`).toBe(true);
        }
    });

    it('no UI action uses get_session_data (legacy name)', () => {
        expect(UI_ACTIONS).not.toContain('get_session_data');
    });

    it('SW handles all critical actions', () => {
        const required = [
            'start', 'stop', 'get_status', 'get_capture_data',
            'list_captures', 'delete_capture',
            'export_json', 'export_jsonl', 'export_html', 'export_har',
            'export_app_logs', 'clear_app_logs', 'get_app_log_size',
        ];
        for (const action of required) {
            expect(sw_cases.has(action), `Required action "${action}" missing from SW`).toBe(true);
        }
    });
});

describe('P0.46: get_capture_data 响应契约（data 为 capture 元数据，不含全量事件）', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        install_chrome_mock();
        load_user_config.mockResolvedValue({ agent_bridge_enabled: false, log_level: 'error' });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('AC-001: get_capture_data 响应 { success, data: capture }，data 不含全量事件字段', async () => {
        const { init_db } = await import('../../src/extension/background/storage');
        await init_db();
        await import('../../src/extension/background/service_worker');

        const cap_id = 'cap_contract';
        const start_res = await send_message({ action: 'start', payload: { capture_id: cap_id, config: { capture_network: false, capture_console: false } } });
        expect(start_res.success).toBe(true);

        // 写入一条事件，确保有可读数据
        await send_message({ action: 'event', event: { type: 'mouse_click', data: { x: 1, y: 2 } } });

        const resp = await send_message({ action: 'get_capture_data', payload: { capture_id: cap_id } });
        expect(resp.success).toBe(true);
        // 契约形状：capture 在 data 下
        expect(resp.data).toBeDefined();
        expect(resp.data.capture_id).toBe(cap_id);
        // 仅元数据：不含全量事件/网络/console 数组（防 64MB 大载荷回传）
        expect(resp.data.events).toBeUndefined();
        expect(resp.data.network_requests).toBeUndefined();
        expect(resp.data.console_logs).toBeUndefined();

        await send_message({ action: 'stop', payload: {} });
    });

    it('AC-002: 不存在的 capture 返回 { success: false, error }', async () => {
        const { init_db } = await import('../../src/extension/background/storage');
        await init_db();
        await import('../../src/extension/background/service_worker');

        const resp = await send_message({ action: 'get_capture_data', payload: { capture_id: 'missing' } });
        expect(resp.success).toBe(false);
        expect(typeof resp.error).toBe('string');
    });
});
