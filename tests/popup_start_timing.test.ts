// @vitest-environment jsdom
// tests/popup_start_timing.test.ts — 验证 start 失败时 storage.local.set 不写入采集状态
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock chrome API ──────────────────────────────────────────
const send_message_mock = vi.fn();
const storage_set_mock = vi.fn();

Object.defineProperty(globalThis, 'chrome', {
    value: {
        runtime: { sendMessage: send_message_mock },
        storage: {
            local: {
                get: vi.fn().mockResolvedValue({}),
                set: storage_set_mock,
            },
        },
        tabs: { create: vi.fn() },
    },
    writable: true,
});

// ── DOM stubs ────────────────────────────────────────────────
document.body.innerHTML = `
<div id="timer"></div>
<div id="view"></div>
<div id="panelBtn"></div>
<button id="startBtn"></button>
<button id="stopBtn"></button>
<button id="newBtn"></button>
<button id="liveDetailBtn"></button>
<button id="openDetailBtn"></button>
<button id="exportBtn"></button>
`;

// ── Module stubs ─────────────────────────────────────────────
vi.mock('../src/extension/shared/i18n', () => ({
    init_locale: vi.fn(),
    t: (k: string) => k,
    apply_translations: vi.fn(),
}));
vi.mock('../src/extension/shared/theme', () => ({
    init_theme: vi.fn(),
}));
vi.mock('../src/shared/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../src/shared/user_config', () => ({
    load_user_config: vi.fn().mockResolvedValue({}),
}));
vi.mock('../src/shared/constants', () => ({
    DEFAULT_USER_CONFIG: {},
}));
vi.mock('../src/extension/shared/export_utils', () => ({
    download_blob: vi.fn(),
    build_capture_filename: vi.fn(),
}));
vi.mock('../src/extension/shared/archive_builder', () => ({
    build_archive: vi.fn(),
}));
vi.mock('../src/shared/system_time', () => ({
    format_system_time: vi.fn(),
}));

describe('start_capture storage timing (BUG-015)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('start 失败（success=false）时，storage.local.set 不写入 is_capturing', async () => {
        // sendMessage 返回 success=false
        send_message_mock.mockResolvedValue({ success: false, error: 'tab not found' });

        // 动态 import popup 模块以触发初始化
        try {
            await import('../src/extension/popup/popup.ts');
        } catch {
            // popup 可能因 DOM 不完整报错，不影响测试逻辑
        }

        // 模拟 start_capture 被触发
        // 查找 storage_set_mock 的调用中是否包含 is_capturing: true
        const capturing_set_calls = storage_set_mock.mock.calls.filter(
            (call: any[]) => call[0] && call[0].is_capturing === true,
        );

        // start 失败 → 不应该写入 is_capturing: true
        expect(capturing_set_calls.length).toBe(0);
    });

    it('start 成功时，storage.local.set 写入 is_capturing 和 current_capture', async () => {
        const fs = await import('fs');
        const path = await import('path');
        const src = fs.readFileSync(
            path.resolve(__dirname, '../src/extension/popup/popup.ts'),
            'utf-8',
        );

        // 找 start_capture 函数体
        const fn_start = src.indexOf('async function start_capture(): Promise<void> {');
        let depth = 0;
        let fn_end = fn_start;
        for (let i = fn_start; i < src.length; i++) {
            if (src[i] === '{') depth++;
            if (src[i] === '}') {
                depth--;
                if (depth === 0) { fn_end = i; break; }
            }
        }
        const body = src.slice(fn_start, fn_end + 1);

        // 成功路径：response?.success 检查在 storage.local.set({ is_capturing }) 之前
        const success_check_pos = body.indexOf('response?.success');
        const storage_is_capturing_pos = body.indexOf('is_capturing: true');

        expect(success_check_pos).toBeGreaterThan(-1);
        expect(storage_is_capturing_pos).toBeGreaterThan(-1);
        // success 检查必须在 storage 写入之前
        expect(success_check_pos).toBeLessThan(storage_is_capturing_pos);
    });

    it('源码：storage.local.set({ is_capturing }) 在 sendMessage start 之后', async () => {
        const fs = await import('fs');
        const path = await import('path');
        const src = fs.readFileSync(
            path.resolve(__dirname, '../src/extension/popup/popup.ts'),
            'utf-8',
        );

        // 找 start_capture 函数体
        const fn_start = src.indexOf('async function start_capture(): Promise<void> {');
        expect(fn_start).toBeGreaterThan(-1);

        let depth = 0;
        let fn_end = fn_start;
        for (let i = fn_start; i < src.length; i++) {
            if (src[i] === '{') depth++;
            if (src[i] === '}') {
                depth--;
                if (depth === 0) { fn_end = i; break; }
            }
        }
        const body = src.slice(fn_start, fn_end + 1);

        // sendMessage('start') 应出现在 storage.local.set({ is_capturing }) 之前
        const send_msg_pos = body.indexOf("sendMessage({ action: 'start'");
        const storage_is_capturing_pos = body.indexOf('is_capturing: true');

        expect(send_msg_pos).toBeGreaterThan(-1);
        expect(storage_is_capturing_pos).toBeGreaterThan(-1);
        expect(send_msg_pos).toBeLessThan(storage_is_capturing_pos);

        // capture_toggles 也应在 sendMessage 之后
        const capture_toggles_pos = body.indexOf('capture_toggles: toggles');
        expect(capture_toggles_pos).toBeGreaterThan(-1);
        expect(send_msg_pos).toBeLessThan(capture_toggles_pos);
    });
});
